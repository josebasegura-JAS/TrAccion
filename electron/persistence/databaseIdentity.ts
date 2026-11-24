import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';
import { CURRENT_SCHEMA_VERSION, readCurrentSchemaVersion } from './schemaMigrations.js';
import { getTraccionEnvironment, type TraccionEnvironment } from './traccionEnvironment.js';

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
  expectedEnvironment?: TraccionEnvironment;
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
  const expectedEnvironment = options.expectedEnvironment ?? getTraccionEnvironment();

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
      if (environment !== expectedEnvironment) {
        throw new Error(
          `La base pertenece al entorno "${environment}" y esta instalación solo admite "${expectedEnvironment}".`,
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

    if (options.expectedDatabaseUuid) {
      throw new Error('La base vinculada ha perdido su identidad SQLite. No se reasignará automáticamente su UUID.');
    }
    if (!options.allowLegacyBootstrap || !looksLikeLegacyTraccionDatabase(db)) {
      throw new Error(
        'El fichero SQLite seleccionado no se reconoce como una base de datos de TrAcción. No se ha migrado ni modificado.',
      );
    }

    const nextIdentity: DatabaseIdentity = {
      applicationId: TRACCION_APPLICATION_ID,
      databaseUuid: randomUUID(),
      createdAt: new Date().toISOString(),
      environment: expectedEnvironment,
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

/**
 * Comprobación de identidad previa a locks, pruebas de escritura, migraciones y
 * restauraciones. El modo de pruebas no debe tocar una base existente con
 * identidad de producción; tampoco admite bases legadas sin identificación.
 */
export function assertDatabaseEnvironmentBeforeWrite(
  databasePath: string,
  expectedEnvironment: TraccionEnvironment = getTraccionEnvironment(),
): void {
  const BetterSqlite3 = require('better-sqlite3') as BetterSqlite3Constructor;
  const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true });
  try {
    const appId = readMetadata(db, APPLICATION_ID_KEY);
    const environment = readMetadata(db, ENVIRONMENT_KEY);
    const id = readMetadata(db, DATABASE_UUID_KEY);
    if (expectedEnvironment === 'test' && (!appId || !environment || !id)) {
      throw new Error('Pruebas rechaza una SQLite existente sin identidad test completa.');
    }
    if (appId && appId !== TRACCION_APPLICATION_ID) {
      throw new Error('SQLite de otra aplicación: se rechaza sin modificarla.');
    }
    if (environment && environment !== expectedEnvironment) {
      throw new Error(`Entorno incompatible: base ${environment}, instancia ${expectedEnvironment}. No se ha modificado SQLite.`);
    }
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
