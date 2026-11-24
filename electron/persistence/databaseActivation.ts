import { open, stat } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import {
  ensureDirectoryIsUsable,
  prepareDatabaseFile,
} from './databaseFileSystem.js';
import {
  getDatabasePathForDirectory,
  readDatabasePreferences,
  writeDatabasePreferences,
} from './databasePreferences.js';
import {
  inspectAndEnsureDatabaseIdentity,
  assertDatabaseEnvironmentBeforeWrite,
  readDatabaseIdentity,
} from './databaseIdentity.js';
import { openSqliteDatabase } from './sqliteConnection.js';
import { CURRENT_SCHEMA_VERSION } from './schemaMigrations.js';
import { getTraccionEnvironment } from './traccionEnvironment.js';
import type { DatabaseLockInfo } from './sqliteLockLifecycle.js';

/**
 * No confundir error SMB (EACCES/EIO/UNKNOWN) con ENOENT: ante duda
 * no se autoriza creación de base de prueba.
 */
async function databaseExistsReliably(databasePath: string): Promise<boolean> {
  try {
    const entry = await stat(databasePath);
    if (!entry.isFile()) throw new Error('La ruta SQLite existe, pero no es un archivo regular.');
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

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

  const environment = getTraccionEnvironment();
  // Rechazar primero la base incompatible: sin escribir probes ni lockdir.
  if (await databaseExistsReliably(databasePath)) {
    assertDatabaseEnvironmentBeforeWrite(databasePath, environment);
  }
  if (environment === 'test' && sourceDatabasePath !== null) {
    throw new Error('Pruebas no copia automáticamente SQLite de otra carpeta.');
  }
  await ensureDirectoryIsUsable(directoryPath);

  const startupLock = await dependencies.acquireStartupLock(databasePath);
  let startupLockHeartbeat: ReturnType<typeof setInterval> | undefined;
  let database: Database | null = null;
  try {
    startupLockHeartbeat = dependencies.startDatabaseLockHeartbeat(lockPath, startupLock);
    // Segunda validación después de obtener el lock: otro proceso podría
    // haber publicado la SQLite entre el stat anterior y esta adquisición.
    const existsAfterLock = await databaseExistsReliably(databasePath);
    if (existsAfterLock && environment === 'test') {
      assertDatabaseEnvironmentBeforeWrite(databasePath, 'test');
    }
    if (!existsAfterLock) {
      if (environment !== 'test') {
        throw new Error(
          `No se encuentra la base de datos compartida configurada: ${databasePath}. ` +
            'TrAcción permanecerá bloqueado hasta recuperar esa base o corregir la ruta en Ajustes.',
        );
      }
      // Crear exclusivamente una base vacía test, nunca copiar producción.
      // La operación exclusiva O_EXCL falla si otro cliente creó SQLite
      // entre el stat y nuestra publicación; nunca abrir sin comprobar.
      const handle = await open(databasePath, 'wx');
      await handle.close();
      const newTestDb = openSqliteDatabase(databasePath, { busyTimeoutMs: dependencies.busyTimeoutMs });
      newTestDb.close();
    }

    await prepareDatabaseFile(databasePath, sourceDatabasePath);

    const preferences = await readDatabasePreferences();
    // Una base ya vinculada no puede adoptar el UUID esperado si carece de identidad.
    const allowLegacyBootstrap = !preferences.expectedDatabaseUuid;
    const identityInspection = inspectAndEnsureDatabaseIdentity(databasePath, {
      expectedDatabaseUuid: preferences.expectedDatabaseUuid ?? null,
      allowLegacyBootstrap,
      expectedEnvironment: environment,
    });

    database = openSqliteDatabase(databasePath, {
      busyTimeoutMs: dependencies.busyTimeoutMs,
    });
    const identity = readDatabaseIdentity(database);
    if (!identity || identity.databaseUuid !== identityInspection.identity.databaseUuid ||
        identity.applicationId !== identityInspection.identity.applicationId ||
        identity.environment !== identityInspection.identity.environment) {
      throw new Error('La identidad SQLite cambió durante la activación.');
    }

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
    try { database?.close(); } catch (closeError) {
      console.warn('[sqlite-activation] No se pudo cerrar la conexión fallida.', closeError);
    }
    try { await dependencies.releaseLock(lockPath, startupLock); } catch (releaseError) {
      console.warn('[sqlite-activation] No se pudo liberar el bloqueo de activación.', releaseError);
    }
    throw error;
  }
}
