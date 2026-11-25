/**
 * PR9C · utilityProcess experimental con SQLite exclusivamente en memoria.
 * Comprueba la carga nativa, apertura, migraciones y lectura/escritura sin SMB.
 */
import { openSqliteDatabase } from './persistence/sqliteConnection.js';
import { createEngineDispatcher, type EngineOperation } from './sqliteEngineTransport.js';
import { isSqliteWorkerProbeRequest } from './sqliteWorkerProbeProtocol.js';

const port = process.parentPort;
if (!port) {
  throw new Error('sqliteWorkerProbe debe iniciarse desde Electron utilityProcess.');
}

// No aceptar rutas externas: esta prueba nunca abre datos de producción.
const db = openSqliteDatabase(':memory:', { busyTimeoutMs: 1000 });
try {
  db.exec('CREATE TEMP TABLE isolation_probe (value INTEGER NOT NULL)');
  db.prepare('INSERT INTO isolation_probe (value) VALUES (?)').run(42);
  const row = db.prepare('SELECT value FROM isolation_probe').get() as { value: number } | undefined;
  if (row?.value !== 42) throw new Error('Falló la prueba SQLite del proceso auxiliar.');
} finally {
  db.close();
}

// Primera operación autorizada: diagnóstico sin acceso a datos reales.
const dispatch = createEngineDispatcher(new Map<string, EngineOperation>([
  ['probe', () => ({ sqliteAvailable: true })],
]));

port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isSqliteWorkerProbeRequest(message)) {
    void dispatch(message).then((response) => {
      if (response) port.postMessage(response);
    });
    return;
  }
  if (message.kind === 'probe:shutdown') {
    process.exit(0);
  }
  if (message.kind === 'probe:ping') {
    port.postMessage({ kind: 'probe:pong', id: message.id });
  }
});
port.postMessage({ kind: 'probe:ready' });
