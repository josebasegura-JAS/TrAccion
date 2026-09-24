import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, readCurrentSchemaVersion } from './schemaMigrations.js';

const require = createRequire(import.meta.url);

type BetterSqlite3Constructor = new (
  filename: string,
  options?: { readonly?: boolean; fileMustExist?: boolean },
) => Database;

export const TRACCION_APPLICATION_ID = 'TrAccion';
export const TRACCION_DATABASE_ENVIRONMENT = 'production';

const APPLICATION_ID_KEY = 'application_id';
const DATABASE_UUID_KEY = 'database_uuid';
const CREATED_AT_KEY = 'database_created_at';
const ENVIRONMENT_KEY = 'environment';

export interface DatabaseIdentity {
  applicationId: string;
  databaseUuid: string;
  createdAt: string;
  environment: string;
}

interface MetadataRow {
  value: string;
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

function writeMetadata(db: Database, key: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, now);
}

function looksLikeLegacyTraccionDatabase(db: Database): boolean {
  if (!tableExists(db, 'schema_migrations')) {
    return false;
  }

  const version = readCurrentSchemaVersion(db);
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) {
    return false;
  }

  // Tablas nucleares presentes desde las primeras versiones. Una SQLite ajena
  // no debe ser migrada ni modificada solo por haber sido seleccionada por error.
  return tableExists(db, 'persisted_records') && tableExists(db, 'app_metadata');
}

export interface InspectDatabaseIdentityOptions {
  expectedDatabaseUuid?: string | null;
  allowLegacyBootstrap?: boolean;
}

export interface DatabaseIdentityInspection {
  identity: DatabaseIdentity;
  bootstrappedLegacyIdentity: boolean;
}

export function inspectAndEnsureDatabaseIdentity(
  databasePath: string,
  options: InspectDatabaseIdentityOptions = {},
): DatabaseIdentityInspection {
  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Constructor;
  const db = new BetterSqlite3(databasePath, { readonly: false, fileMustExist: true });

  try {
    const applicationId = readMetadata(db, APPLICATION_ID_KEY);
    const databaseUuid = readMetadata(db, DATABASE_UUID_KEY);
    const createdAt = readMetadata(db, CREATED_AT_KEY);
    const environment = readMetadata(db, ENVIRONMENT_KEY);

    const hasAnyIdentityMetadata = Boolean(applicationId || databaseUuid || createdAt || environment);
    const hasCompleteIdentity = Boolean(applicationId && databaseUuid && createdAt && environment);

    if (hasAnyIdentityMetadata && !hasCompleteIdentity) {
      throw new Error(
        'La base SQLite contiene metadatos de identidad incompletos. No se activará para evitar trabajar sobre una base dudosa.',
      );
    }

    if (applicationId && databaseUuid && createdAt && environment) {
      if (applicationId !== TRACCION_APPLICATION_ID) {
        throw new Error(
          `La SQLite seleccionada pertenece a otra aplicación (${applicationId}). No se ha modificado el fichero.`,
        );
      }
      if (environment !== TRACCION_DATABASE_ENVIRONMENT) {
        throw new Error(
          `La base pertenece al entorno "${environment}" y esta instalación solo admite "${TRACCION_DATABASE_ENVIRONMENT}".`,
        );
      }
      if (options.expectedDatabaseUuid && databaseUuid !== options.expectedDatabaseUuid) {
        throw new Error(
          `La base SQLite no coincide con la base compartida vinculada a este equipo. Identificador esperado ${options.expectedDatabaseUuid.slice(0, 8)}…, recibido ${databaseUuid.slice(0, 8)}….`,
        );
      }

      return {
        identity: {
          applicationId,
          databaseUuid,
          createdAt,
          environment,
        },
        bootstrappedLegacyIdentity: false,
      };
    }

    if (!options.allowLegacyBootstrap || !looksLikeLegacyTraccionDatabase(db)) {
      throw new Error(
        'El fichero SQLite seleccionado no se reconoce como una base de datos de TrAcción. No se ha migrado ni modificado.',
      );
    }

    const nextIdentity: DatabaseIdentity = {
      applicationId: TRACCION_APPLICATION_ID,
      databaseUuid: options.expectedDatabaseUuid ?? randomUUID(),
      createdAt: new Date().toISOString(),
      environment: TRACCION_DATABASE_ENVIRONMENT,
    };

    const assignIdentity = db.transaction(() => {
      writeMetadata(db, APPLICATION_ID_KEY, nextIdentity.applicationId);
      writeMetadata(db, DATABASE_UUID_KEY, nextIdentity.databaseUuid);
      writeMetadata(db, CREATED_AT_KEY, nextIdentity.createdAt);
      writeMetadata(db, ENVIRONMENT_KEY, nextIdentity.environment);
    });
    assignIdentity();

    return { identity: nextIdentity, bootstrappedLegacyIdentity: true };
  } finally {
    db.close();
  }
}

export function readDatabaseIdentity(db: Database): DatabaseIdentity | null {
  const applicationId = readMetadata(db, APPLICATION_ID_KEY);
  const databaseUuid = readMetadata(db, DATABASE_UUID_KEY);
  const createdAt = readMetadata(db, CREATED_AT_KEY);
  const environment = readMetadata(db, ENVIRONMENT_KEY);
  if (!applicationId || !databaseUuid || !createdAt || !environment) {
    return null;
  }
  return { applicationId, databaseUuid, createdAt, environment };
}
