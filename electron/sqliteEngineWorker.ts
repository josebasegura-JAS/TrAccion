import { configurePersistenceUserDataPath } from './persistence/persistenceRuntime.js';
import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { createEngineDispatcher } from './sqliteEngineTransport.js';
import { createPersistenceOperations, isEngineReadOnlyOperation } from './sqliteEngineOperations.js';
import { runSqliteEngineOperation } from './sqliteIpcQueue.js';
import { isEngineRequest } from './sqliteEngineTransport.js';

const port = process.parentPort;
if (!port) throw new Error('Se requiere utilityProcess.');
// No admitir producción hasta integrar de forma exclusiva el propietario.
if (getTraccionEnvironment() !== 'test') throw new Error('Motor aislado reservado a pruebas.');
const paths = process.argv.filter((arg) => arg.startsWith('--sqlite-user-data='));
if (paths.length !== 1) throw new Error('Contexto local SQLite obligatorio.');
configurePersistenceUserDataPath(paths[0].slice('--sqlite-user-data='.length));

const persistence = await import('./sqlitePersistence.js');
const operations = createPersistenceOperations(persistence);
const { verifySqliteIntegrityReadOnly } = await import('./persistence/sqliteIntegrityVerification.js');
const { readDatabasePreferences, getDatabasePathForDirectory } = await import('./persistence/databasePreferences.js');
operations.set('recoverAfterIdleExit', async (previousValue) => {
  const previous = previousValue as import('./sqlitePersistence.js').DatabaseStatus;
  const preferences = await readDatabasePreferences();
  if (!previous.databaseUuid || !previous.applicationId || previous.environment !== 'test' ||
      !preferences.customDirectoryPath || preferences.expectedDatabaseUuid !== previous.databaseUuid ||
      getDatabasePathForDirectory(preferences.customDirectoryPath) !== previous.path) {
    throw new Error('La identidad o ruta de recuperación SQLite no coincide.');
  }
  verifySqliteIntegrityReadOnly(previous.path, {
    databaseUuid: previous.databaseUuid, applicationId: previous.applicationId,
    environment: previous.environment, schemaVersion: previous.schemaVersion,
  });
  const recovered = await persistence.initializeSqlitePersistence();
  if (!recovered.ready || recovered.phase !== 'active' || recovered.databaseUuid !== previous.databaseUuid ||
      recovered.applicationId !== previous.applicationId || recovered.environment !== previous.environment ||
      recovered.schemaVersion !== previous.schemaVersion) {
    throw new Error('No se ha confirmado la identidad de la base recuperada.');
  }
  return recovered;
});
const { saveTaskRecordsAtomically } = await import('./persistence/taskBatchPersistence.js');
operations.set('saveTaskRecordsAtomically', (...args) => saveTaskRecordsAtomically(args[0] as Parameters<typeof saveTaskRecordsAtomically>[0]));
const { removeTicketRestauranteCalendarWithPeopleAtomically } = await import('./persistence/ticketRestauranteAtomicCalendarRemoval.js');
const { importTicketRestaurantePeopleAtomically } = await import('./persistence/ticketRestauranteAtomicPeopleImport.js');
operations.set('removeTicketRestauranteCalendarWithPeopleAtomically', (...args) =>
  removeTicketRestauranteCalendarWithPeopleAtomically(persistence.getSqliteStatus(), args[0] as Parameters<typeof removeTicketRestauranteCalendarWithPeopleAtomically>[1]));
operations.set('importTicketRestaurantePeopleAtomically', (...args) =>
  importTicketRestaurantePeopleAtomically(persistence.getSqliteStatus(), args[0] as Parameters<typeof importTicketRestaurantePeopleAtomically>[1]));
persistence.setDatabaseConnectivityIssueNotifier((payload) => port.postMessage({ kind: 'engine:connectivity', payload }));
let closing = false;
let closed = false;
const dispatch = createEngineDispatcher(operations);
port.on('message', (event: { data: unknown }) => {
  const request = event.data;
  if (request === 'engine:shutdown' && closed) { process.exit(0); }
  if (!isEngineRequest(request) || closing) return;
  if (request.operation === 'closeSqlitePersistence') closing = true;
  // Solo las consultas explícitamente verificadas evitan el lock externo.
  // Las lecturas con migraciones conservan el contexto de escritura.
  void runSqliteEngineOperation(request.operation, isEngineReadOnlyOperation(request.operation), () => dispatch(request)).then((response) => {
    if (request.operation === 'closeSqlitePersistence' && response?.kind === 'engine:result') closed = true;
    port.postMessage({ kind: 'engine:status', status: persistence.getSqliteStatus() });
    if (response) port.postMessage(response);
  }).catch((error: unknown) => {
    // No se ha podido confirmar el resultado. El cliente mantiene el canal
    // reservado hasta su propio timeout; no admite otro propietario.
    console.error('[sqlite-engine]', error);
  });
});
port.postMessage({ kind: 'engine:ready' });
