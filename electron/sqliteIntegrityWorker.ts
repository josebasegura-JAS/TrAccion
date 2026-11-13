/**
 * PR9D · SQLite nativa SOLO READONLY en utilityProcess.
 * Nunca escribe, migra ni mantiene locks de edición. La vida del proceso
 * termina al recibir shutdown DESPUÉS de completar quick_check e identidad.
 */
import { verifySqliteIntegrityReadOnly } from './persistence/sqliteIntegrityVerification.js';
import { isSqliteIntegrityWorkerRequest } from './sqliteIntegrityWorkerProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('El preflight SQLite debe ejecutarse como utilityProcess.');

let completed = false;
port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isSqliteIntegrityWorkerRequest(message)) return;
  if (message.kind === 'integrity:shutdown') {
    if (completed) process.exit(0);
    return;
  }
  if (completed) return;
  completed = true;
  try {
    verifySqliteIntegrityReadOnly(message.databasePath, message.expected);
    port.postMessage({ kind: 'integrity:verified' });
  } catch {
    // Un mensaje nativo de SQLite/Node puede exponer rutas UNC o SQL.
    // La causa y los datos no deben cruzar ni quedar registrados en main.
    port.postMessage({ kind: 'integrity:rejected' });
  }
});
