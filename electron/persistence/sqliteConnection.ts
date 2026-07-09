import { createRequire } from 'node:module';
import type { Database, DatabaseConstructor } from 'better-sqlite3';
import { pruneLocalStorageBackups } from './maintenanceQueries.js';
import {
  applyMigrations,
  CURRENT_SCHEMA_VERSION,
  readCurrentSchemaVersion,
} from './schemaMigrations.js';

const require = createRequire(import.meta.url);

export interface OpenSqliteDatabaseOptions {
  busyTimeoutMs: number;
}

export function openSqliteDatabase(
  databasePath: string,
  options: OpenSqliteDatabaseOptions,
): Database {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath);
  db.pragma(`busy_timeout = ${options.busyTimeoutMs}`);
  // En carpetas SMB/WAL se han observado corrupciones con varias instancias.
  // La concurrencia se coordina con un lock corto por operación, así que usamos
  // rollback journal clásico, más compatible con red que WAL/-shm.
  db.pragma('journal_mode = DELETE');
  // NORMAL es suficiente con journal_mode=DELETE y 2-3 usuarios: solo se
  // perdería una transacción en un apagado abrupto justo en el fsync, algo
  // improbable en uso normal. FULL hacía un fsync de red en cada escritura,
  // añadiendo 50-500 ms de latencia SMB por operación.
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Protección contra downgrade: si la base tiene un schema más nuevo que esta
  // versión del ejecutable, rechazar la apertura con un mensaje claro. Abrir una
  // base con schema superior podría ignorar tablas o columnas nuevas y corromper datos.
  const existingVersion = readCurrentSchemaVersion(db);
  if (existingVersion > CURRENT_SCHEMA_VERSION) {
    db.close();
    throw new Error(
      `La base de datos tiene schema v${existingVersion} pero esta versión de TrAccion solo soporta hasta v${CURRENT_SCHEMA_VERSION}. ` +
      'Actualiza TrAccion antes de continuar.',
    );
  }

  applyMigrations(db);
  pruneLocalStorageBackups(db);
  return db;
}
