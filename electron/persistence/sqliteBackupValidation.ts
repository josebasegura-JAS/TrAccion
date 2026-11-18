import { createRequire } from 'node:module';
import type { Database } from 'better-sqlite3';
import {
  TRACCION_APPLICATION_ID,
  TRACCION_DATABASE_ENVIRONMENT,
} from './databaseIdentity.js';
import { CURRENT_SCHEMA_VERSION, readCurrentSchemaVersion } from './schemaMigrations.js';

const require = createRequire(import.meta.url);

type BetterSqlite3Constructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => Database;

interface QuickCheckRow {
  quick_check?: string;
}

interface MetadataRow {
  value: string;
}

export interface SqliteBackupValidationOptions {
  expectedDatabaseUuid?: string | null;
}

export interface SqliteBackupValidationResult {
  schemaVersion: number;
  databaseUuid: string | null;
  legacyIdentity: boolean;
}

function tableExists(db: Database, tableName: string): boolean {
  return Boolean(
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function readMetadata(db: Database, key: string): string | null {
  if (!tableExists(db, 'app_metadata')) {
    return null;
  }
  const row = db.prepare('SELECT value FROM app_metadata WHERE key = ?').get(key) as MetadataRow | undefined;
  return typeof row?.value === 'string' && row.value.trim() ? row.value.trim() : null;
}

function validationError(message: string): Error {
  return new Error(`El respaldo SQLite ${message}`);
}

export function validateSqliteBackupForRestore(
  databasePath: string,
  options: SqliteBackupValidationOptions = {},
): SqliteBackupValidationResult {
  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Constructor;
  let db: Database | null = null;

  try {
    db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });

    const quickCheckRows = db.pragma('quick_check') as QuickCheckRow[];
    if (
      quickCheckRows.length === 0 ||
      quickCheckRows.some((row) => row.quick_check !== 'ok')
    ) {
      throw validationError('no supera la comprobación de integridad y no se restaurará.');
    }

    const schemaVersion = readCurrentSchemaVersion(db);
    if (schemaVersion < 1) {
      throw validationError('no se reconoce como una base de datos de TrAcción.');
    }
    if (schemaVersion > CURRENT_SCHEMA_VERSION) {
      throw validationError(
        `usa un schema más reciente (${schemaVersion}) que esta versión de TrAcción (${CURRENT_SCHEMA_VERSION}) y no se restaurará.`,
      );
    }

    if (!tableExists(db, 'persisted_records') || !tableExists(db, 'app_metadata')) {
      throw validationError('no contiene la estructura mínima esperada de TrAcción.');
    }

    const applicationId = readMetadata(db, 'application_id');
    const databaseUuid = readMetadata(db, 'database_uuid');
    const createdAt = readMetadata(db, 'database_created_at');
    const environment = readMetadata(db, 'environment');

    const hasAnyIdentityMetadata = Boolean(applicationId || databaseUuid || createdAt || environment);
    const hasCompleteIdentity = Boolean(applicationId && databaseUuid && createdAt && environment);

    if (hasAnyIdentityMetadata && !hasCompleteIdentity) {
      throw validationError('contiene metadatos de identidad incompletos y no se restaurará.');
    }

    if (applicationId && databaseUuid && createdAt && environment) {
      if (applicationId !== TRACCION_APPLICATION_ID) {
        throw validationError(`pertenece a otra aplicación (${applicationId}) y no se restaurará.`);
      }
      if (environment !== TRACCION_DATABASE_ENVIRONMENT) {
        throw validationError(
          `pertenece al entorno "${environment}" y esta instalación solo admite "${TRACCION_DATABASE_ENVIRONMENT}".`,
        );
      }
      if (options.expectedDatabaseUuid && databaseUuid !== options.expectedDatabaseUuid) {
        throw validationError('no coincide con la base compartida vinculada a este equipo y no se restaurará.');
      }

      return { schemaVersion, databaseUuid, legacyIdentity: false };
    }

    // Las copias legacy anteriores a la identidad explícita siguen siendo válidas
    // si conservan la estructura nuclear y un schema que esta build sabe migrar.
    return { schemaVersion, databaseUuid: null, legacyIdentity: true };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('El respaldo SQLite ')) {
      throw error;
    }
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw validationError(`no es válido, está dañado o no puede leerse.${detail}`);
  } finally {
    db?.close();
  }
}
