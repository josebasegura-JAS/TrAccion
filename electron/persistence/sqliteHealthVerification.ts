/**
 * PR9D-2 · Verificación rutinaria de la conexión desde un proceso auxiliar.
 * Read-only, sin escrituras, migraciones ni limpieza de locks.
 * Reutiliza el mismo contrato de identidad que el preflight de integridad,
 * pero NO ejecuta quick_check en cada health-check.
 */
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './databaseIdentity.js';
import { readCurrentSchemaVersion } from './schemaMigrations.js';
import type { ExpectedSqliteIdentity } from './sqliteIntegrityVerification.js';

const require = createRequire(import.meta.url);

export function verifySqliteHealthReadOnly(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): void {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const row = db.prepare('SELECT 1 AS ok').get() as { ok?: number } | undefined;
    if (row?.ok !== 1) {
      throw new Error('No se ha podido consultar SQLite desde el proceso auxiliar.');
    }
    if (readCurrentSchemaVersion(db) !== expected.schemaVersion) {
      throw new Error('El esquema de SQLite no coincide con el validado.');
    }
    const identity = readDatabaseIdentity(db);
    if (!identity ||
        identity.databaseUuid !== expected.databaseUuid ||
        identity.applicationId !== expected.applicationId ||
        identity.environment !== expected.environment) {
      throw new Error('La identidad SQLite no coincide con la sesión.');
    }
  } finally {
    db.close();
  }
}
