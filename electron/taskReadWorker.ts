/** PR9D-4A: consulta SQLite nativa de Tareas solo lectura en utilityProcess. */
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readTaskRecords } from './persistence/taskRepository.js';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { isTaskReadWorkerRequest } from './taskReadWorkerProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('Task reader debe ejecutarse en utilityProcess.');
const require = createRequire(import.meta.url);
let completed = false;

port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isTaskReadWorkerRequest(message)) return;
  if (message.kind === 'tasks:shutdown') {
    if (completed) process.exit(0);
    return;
  }
  if (completed) return;
  completed = true;
  try {
    const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
    const db = new BetterSqlite3(message.databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('busy_timeout = 5000');
      const identity = readDatabaseIdentity(db);
      if (!identity || identity.databaseUuid !== message.expected.databaseUuid ||
          identity.applicationId !== message.expected.applicationId ||
          identity.environment !== message.expected.environment ||
          readCurrentSchemaVersion(db) !== message.expected.schemaVersion) {
        throw new Error('Identidad de SQLite distinta de la sesión.');
      }
      const records = readTaskRecords(db, message.filter);
      port.postMessage({ kind: 'tasks:result', records });
    } finally {
      db.close();
    }
  } catch {
    // No transmitir errores nativos: podrían incluir rutas, SQL o datos.
    port.postMessage({ kind: 'tasks:rejected' });
  }
});
port.postMessage({ kind: 'tasks:ready' });
