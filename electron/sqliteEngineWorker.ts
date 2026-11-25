import { configurePersistenceUserDataPath } from './persistence/persistenceRuntime.js';
import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { createEngineDispatcher } from './sqliteEngineTransport.js';
import { createPersistenceOperations } from './sqliteEngineOperations.js';
import { enqueueSqliteIpc } from './sqliteIpcQueue.js';
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
  // Conservar el contexto de escritura incluso para lecturas que migren datos.
  // El cliente admite una sola petición simultánea; no se reintentan peticiones.
  void enqueueSqliteIpc('engine:operation', () => dispatch(request)).then((response) => {
    if (request.operation === 'closeSqlitePersistence' && response?.kind === 'engine:result') closed = true;
    port.postMessage({ kind: 'engine:status', status: persistence.getSqliteStatus() });
    if (response) port.postMessage(response);
  }).catch((error: unknown) => {
    // Un timeout de la cola no demuestra que la operación haya terminado.
    // No responder como fallo definitivo ni admitir un nuevo propietario.
    console.error('[sqlite-engine]', error);
  });
});
port.postMessage({ kind: 'engine:ready' });
