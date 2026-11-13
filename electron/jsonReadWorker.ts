/** PR9D-4C: lectura nativa JSON con SQLite readonly en utilityProcess. */
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readActiveJsonRecords } from './persistence/jsonRecordRepository.js';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { isJsonReadRequest } from './jsonReadWorkerProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('Se requiere utilityProcess para el lector JSON.');
const require = createRequire(import.meta.url);
let completed = false;
port.on('message', (event: { data: unknown }) => {
  const request = event.data;
  if (!isJsonReadRequest(request)) return;
  if (request.kind === 'json:shutdown') {
    if (completed) process.exit(0);
    return;
  }
  if (completed) return;
  completed = true;
  try {
    const Ctor = require('better-sqlite3') as DatabaseConstructor;
    const db = new Ctor(request.databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('busy_timeout = 5000');
      const actual = readDatabaseIdentity(db);
      if (!actual || actual.databaseUuid !== request.expected.databaseUuid
        || actual.applicationId !== request.expected.applicationId
        || actual.environment !== request.expected.environment
        || readCurrentSchemaVersion(db) !== request.expected.schemaVersion) {
        throw new Error('Identidad o esquema no coincidente.');
      }
      const records = readActiveJsonRecords(db, request.table);
      port.postMessage({ kind: 'json:result', records });
    } finally {
      db.close();
    }
  } catch {
    // Evitar transmitir errores nativos con rutas UNC o datos de usuarios.
    port.postMessage({ kind: 'json:rejected' });
  }
});
port.postMessage({ kind: 'json:ready' });
