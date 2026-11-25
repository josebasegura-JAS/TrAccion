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
const dispatch = createEngineDispatcher(operations);
port.on('message', (event: { data: unknown }) => {
  const request = event.data;
  if (!isEngineRequest(request)) return;
  // Conservar el contexto de escritura incluso para lecturas que migren datos.
  // El cliente admite una sola petición simultánea; no se reintentan peticiones.
  void enqueueSqliteIpc('engine:operation', () => dispatch(request)).then((response) => {
    if (response) port.postMessage(response);
  }).catch((error: unknown) => {
    // Un timeout de la cola no demuestra que la operación haya terminado.
    // No responder como fallo definitivo ni admitir un nuevo propietario.
    console.error('[sqlite-engine]', error);
  });
});
port.postMessage({ kind: 'engine:ready' });
