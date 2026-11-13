/** Consulta nativa de tokens, aislada del event loop de Electron main. */
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './persistence/databaseIdentity.js';
import { readCurrentSchemaVersion } from './persistence/schemaMigrations.js';
import { readIsolatedSyncTokens } from './isolatedSyncTokensCore.js';
import { isSyncTokensRequest } from './isolatedSyncTokensProtocol.js';

const port = process.parentPort;
if (!port) throw new Error('El lector de sincronización exige utilityProcess.');
const require = createRequire(import.meta.url);
let completed = false;

port.on('message', (event: { data: unknown }) => {
  const request = event.data;
  if (!isSyncTokensRequest(request)) return;
  if (request.kind === 'sync-tokens:shutdown') {
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
      if (!actual ||
        actual.databaseUuid !== request.expected.databaseUuid ||
        actual.applicationId !== request.expected.applicationId ||
        actual.environment !== request.expected.environment ||
        readCurrentSchemaVersion(db) !== request.expected.schemaVersion) {
        throw new Error('Identidad SQLite distinta de la conexión principal.');
      }
      port.postMessage({ kind: 'sync-tokens:result', snapshot: readIsolatedSyncTokens(db) });
    } finally {
      db.close();
    }
  } catch {
    // No incluir rutas UNC ni metadatos internos en mensajes al main.
    port.postMessage({ kind: 'sync-tokens:rejected' });
  }
});
port.postMessage({ kind: 'sync-tokens:ready' });
