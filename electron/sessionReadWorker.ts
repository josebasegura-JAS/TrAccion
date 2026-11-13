/**
 * PR9D-4B · Consultas nativas readonly de Comité y Paritaria.
 * Una petición, una conexión readonly, ningún SQL aportado por el renderer.
 */
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readActiveJsonRecordById, readActiveJsonRecords } from './persistence/jsonRecordRepository.js';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { isSessionReadRequest } from './sessionReadWorkerProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('Session readonly worker necesita utilityProcess.');
const require = createRequire(import.meta.url);
let completed = false;

port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isSessionReadRequest(message)) return;
  if (message.kind === 'session:shutdown') {
    if (completed) process.exit(0);
    return;
  }
  if (completed) return;
  completed = true;
  try {
    const Ctor = require('better-sqlite3') as DatabaseConstructor;
    const db = new Ctor(message.databasePath, { readonly: true, fileMustExist: true });
    try {
      db.pragma('busy_timeout = 5000');
      const identity = readDatabaseIdentity(db);
      if (!identity || identity.databaseUuid !== message.expected.databaseUuid ||
          identity.applicationId !== message.expected.applicationId ||
          identity.environment !== message.expected.environment ||
          readCurrentSchemaVersion(db) !== message.expected.schemaVersion) {
        throw new Error('Identidad/schema no coincidente.');
      }
      const table = message.module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';
      const records = message.id === undefined
        ? readActiveJsonRecords(db, table)
        : (() => { const row = readActiveJsonRecordById(db, table, message.id); return row ? [row] : []; })();
      port.postMessage({ kind: 'session:result', records });
    } finally {
      db.close();
    }
  } catch {
    // No permitir que errores nativos filtren rutas UNC ni registros.
    port.postMessage({ kind: 'session:rejected' });
  }
});
port.postMessage({ kind: 'session:ready' });
