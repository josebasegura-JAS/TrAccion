import path from 'node:path';
import type { Database } from 'better-sqlite3';
import {
  ensureDirectoryIsUsable,
  fileExists,
  prepareDatabaseFile,
} from './databaseFileSystem.js';
import {
  getDatabasePathForDirectory,
  readDatabasePreferences,
  writeDatabasePreferences,
} from './databasePreferences.js';
import {
  inspectAndEnsureDatabaseIdentity,
  readDatabaseIdentity,
} from './databaseIdentity.js';
import { openSqliteDatabase } from './sqliteConnection.js';
import { CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

export interface DatabaseActivationDependencies {
  ownerId: string;
  busyTimeoutMs: number;
  getLockPath: (databasePath: string) => string;
  acquireStartupLock: (databasePath: string) => Promise<DatabaseLockInfo>;
  startDatabaseLockHeartbeat: (
    lockPath: string,
    lock: DatabaseLockInfo,
  ) => ReturnType<typeof setInterval>;
  releaseLock: (lockPath: string, lock: DatabaseLockInfo) => Promise<void>;
}

export interface ActivatedDatabaseStatus {
  ready: true;
  engine: 'better-sqlite3';
  phase: 'active';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  applicationId: string;
  databaseUuid: string;
  databaseCreatedAt: string;
  environment: string;
}

export interface ActivatedDatabase {
  database: Database;
  status: ActivatedDatabaseStatus;
}

export async function activateSqliteDatabase(
  directoryPath: string,
  isDefaultPath: boolean,
  sourceDatabasePath: string | null,
  dependencies: DatabaseActivationDependencies,
): Promise<ActivatedDatabase> {
  const databasePath = getDatabasePathForDirectory(directoryPath);
  const lockPath = dependencies.getLockPath(databasePath);

  if (isDefaultPath) {
    throw new Error(
      'No hay una base de datos compartida configurada. Selecciona en Ajustes la carpeta que contiene traccion.sqlite. ' +
        'TrAcción permanecerá en modo consulta y no guardará cambios en una base local.',
    );
  }

  await ensureDirectoryIsUsable(directoryPath);

  const startupLock = await dependencies.acquireStartupLock(databasePath);
  const startupLockHeartbeat = dependencies.startDatabaseLockHeartbeat(lockPath, startupLock);

  try {
    if (!isDefaultPath && sourceDatabasePath === null && !(await fileExists(databasePath))) {
      throw new Error(
        `No se encuentra la base de datos compartida configurada: ${databasePath}. ` +
          'TrAcción permanecerá bloqueado hasta recuperar esa base o corregir la ruta en Ajustes.',
      );
    }

    await prepareDatabaseFile(databasePath, sourceDatabasePath);

    const preferences = await readDatabasePreferences();
    const configuredDirectoryMatches = Boolean(
      preferences.customDirectoryPath &&
        path.resolve(preferences.customDirectoryPath) === path.resolve(directoryPath),
    );
    const allowLegacyBootstrap =
      !preferences.expectedDatabaseUuid || sourceDatabasePath !== null || configuredDirectoryMatches;
    const identityInspection = inspectAndEnsureDatabaseIdentity(databasePath, {
      expectedDatabaseUuid: preferences.expectedDatabaseUuid ?? null,
      allowLegacyBootstrap,
    });

    const database = openSqliteDatabase(databasePath, {
      busyTimeoutMs: dependencies.busyTimeoutMs,
    });
    const identity = readDatabaseIdentity(database) ?? identityInspection.identity;

    try {
      database.prepare('DELETE FROM editing_locks WHERE owner_id = ?').run(dependencies.ownerId);
    } catch {
      // Base nueva: la tabla puede no existir todavía.
    }

    const status: ActivatedDatabaseStatus = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isDefaultPath,
      lockPath,
      applicationId: identity.applicationId,
      databaseUuid: identity.databaseUuid,
      databaseCreatedAt: identity.createdAt,
      environment: identity.environment,
    };

    if (!preferences.expectedDatabaseUuid) {
      await writeDatabasePreferences({
        ...preferences,
        expectedDatabaseUuid: identity.databaseUuid,
      });
    }

    clearInterval(startupLockHeartbeat);
    await dependencies.releaseLock(lockPath, startupLock);
    return { database, status };
  } catch (error) {
    clearInterval(startupLockHeartbeat);
    await dependencies.releaseLock(lockPath, startupLock);
    throw error;
  }
}
