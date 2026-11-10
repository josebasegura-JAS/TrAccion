import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { readDatabaseIdentity } from './databaseIdentity.js';
import { readCurrentSchemaVersion } from './schemaMigrations.js';

const require = createRequire(import.meta.url);

export interface ExpectedSqliteIdentity {
  databaseUuid: string;
  applicationId: string;
  environment: string;
  schemaVersion: number;
}

/**
 * Preflight estrictamente de solo lectura antes de reactivar una SQLite
 * que devolvió un error compatible con corrupción durante una operación SMB.
 * Nunca migra, limpia locks ni cambia el fichero al comprobarlo.
 *
 * Una excepción deja la edición suspendida; no demuestra por sí misma daño
 * irreversible (el acceso SMB puede seguir fallando).
 */
export function verifySqliteIntegrityReadOnly(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): void {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    db.pragma('busy_timeout = 5000');
    const check = db.pragma('quick_check') as Array<{ quick_check?: unknown }>;
    if (check.length !== 1 || check[0]?.quick_check !== 'ok') {
      throw new Error('El PRAGMA quick_check de SQLite no ha confirmado la integridad del fichero compartido.');
    }

    if (readCurrentSchemaVersion(db) !== expected.schemaVersion) {
      throw new Error('El esquema SQLite no coincide con el de la sesión suspendida.');
    }
    const identity = readDatabaseIdentity(db);
    if (
      !identity ||
      identity.databaseUuid !== expected.databaseUuid ||
      identity.applicationId !== expected.applicationId ||
      identity.environment !== expected.environment
    ) {
      throw new Error('La identidad SQLite no coincide con la de la sesión suspendida.');
    }
  } finally {
    db.close();
  }
}
