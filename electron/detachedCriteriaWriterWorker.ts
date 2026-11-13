/**
 * Motor de escritura real, pero deliberadamente sin ruta de producción.
 * Requiere que el controlador haya garantizado propiedad exclusiva de la
 * conexión y lock SMB. No valida ni adquiere por sí mismo el lock distribuido.
 */
import { createRequire } from 'node:module';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { saveDetachedCriteriaRecord } from './detachedCriteriaWriterCore.js';
import { isDetachedWriterRequest, type DetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('El escritor aislado requiere utilityProcess.');
const require = createRequire(import.meta.url);
let db: Database | null = null;
let opened = false;
let closing = false;
const seenOperations = new Set<string>();

function send(message: DetachedWriterResponse): void {
  port!.postMessage(message);
}

port.on('message', (event: { data: unknown }) => {
  const message = event.data;
  if (!isDetachedWriterRequest(message) || closing) return;
  if (message.kind === 'detached:close') {
    closing = true;
    try {
      db?.close();
      db = null;
      send({ kind: 'detached:closed' });
      process.exit(0);
    } catch {
      // Un cierre incierto NO autoriza reutilizar la conexión.
      process.exit(1);
    }
    return;
  }
  if (message.kind === 'detached:open') {
    if (opened) { send({ kind: 'detached:error' }); return; }
    opened = true;
    try {
      const Ctor = require('better-sqlite3') as DatabaseConstructor;
      const candidate = new Ctor(message.databasePath, { fileMustExist: true });
      try {
        candidate.pragma('busy_timeout = 5000');
        const identity = readDatabaseIdentity(candidate);
        if (!identity || identity.databaseUuid !== message.expected.databaseUuid ||
          identity.applicationId !== message.expected.applicationId ||
          identity.environment !== message.expected.environment ||
          readCurrentSchemaVersion(candidate) !== message.expected.schemaVersion) {
          throw new Error('Identidad o esquema SQLite incorrecto.');
        }
        db = candidate;
        send({ kind: 'detached:opened' });
      } finally {
        if (db !== candidate) candidate.close();
      }
    } catch {
      send({ kind: 'detached:error' });
    }
    return;
  }
  if (!db) { send({ kind: 'detached:error', operationId: message.operationId }); return; }
  if (seenOperations.has(message.operationId)) {
    send({ kind: 'detached:error', operationId: message.operationId });
    return;
  }
  seenOperations.add(message.operationId);
  try {
    const result = saveDetachedCriteriaRecord(db, message.record);
    send({ kind: 'detached:saved', operationId: message.operationId, result });
  } catch {
    // Nunca reenviar de forma automática un guardado cuya respuesta se perdió.
    send({ kind: 'detached:error', operationId: message.operationId });
  }
});
send({ kind: 'detached:ready' });
