import { copyFile, mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { getDailyLocalBackupWeekdayName } from './maintenanceQueries.js';
import {
  isLocalBackupFileName,
  isShutdownBackupFileName,
  localBackupKindFromFileName,
  LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME,
  resolveLocalBackupReference,
} from './backupReference.js';
import {
  backupTimestampForFileName,
  getLocalBackupDatabasePath,
  getLocalBackupDirectory,
  getLocalBackupJsonPath,
  getLocalShutdownBackupDirectory,
  getRotatedLocalBackupDatabasePath,
  getRotatedLocalBackupJsonPath,
  getShutdownLocalBackupDatabasePath,
  getShutdownLocalBackupJsonPath,
  LOCAL_BACKUP_DATABASE_FILE_NAME,
  LOCAL_BACKUP_JSON_FILE_NAME,
  pruneRotatedLocalBackups,
  pruneShutdownLocalBackups,
  shouldCreateRotatedLocalBackup,
  writeDailyLocalBackup,
  writeSharedSqliteBackup,
} from './localBackups.js';
import {
  getConfiguredDatabaseDirectory,
  getDatabasePathForDirectory,
  readDatabasePreferences,
} from './databasePreferences.js';

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface PersistedStorageRecordSnapshot extends PersistedStorageRecord {
  updatedAt: string;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface LocalBackupEntry {
  id: string;
  fileName: string;
  kind: 'sqlite' | 'json';
  path: string;
  sizeBytes: number;
  createdAt: string;
  isLiveCopy: boolean;
}

export interface DatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  lock?: DatabaseLockInfo;
  message?: string;
}

export interface RestoreLocalBackupResult {
  ok: boolean;
  status: DatabaseStatus;
  message: string;
}

export interface LocalBackupServiceDependencies {
  getDatabase: () => Database | null;
  getStatus: () => DatabaseStatus;
  acquireLock: (databasePath: string) => Promise<DatabaseLockInfo>;
  releaseLock: (lockPath: string, lock: DatabaseLockInfo) => Promise<void>;
  getLockPath: (databasePath: string) => string;
  startDatabaseLockHeartbeat: (lockPath: string, lock: DatabaseLockInfo) => ReturnType<typeof setInterval>;
  isLockContentionError: (error: unknown) => boolean;
  readAllPersistedRecords: (db: Database) => PersistedStorageRecordSnapshot[];
  migrateLocalStorageSnapshot: (payload: LocalStorageBackupPayload) => Promise<DatabaseStatus>;
  withDatabaseOperationLock: <T>(databasePath: string, operation: () => Promise<T>, waitMs?: number) => Promise<T>;
  backupExistingDatabase: (databasePath: string) => Promise<void>;
  closeDatabaseAndReleaseLock: () => Promise<void>;
  activateDatabase: (directoryPath: string, isDefaultPath: boolean, seedFromDatabasePath: string | null) => Promise<DatabaseStatus>;
  enqueueErrorLogger?: (error: unknown) => void;
}

export interface LocalBackupService {
  enqueueLocalBackup: (reason: string) => void;
  flushPendingLocalBackup: () => Promise<void>;
  createShutdownLocalBackup: () => Promise<void>;
  createManualLocalBackup: () => Promise<void>;
  listLocalBackups: () => Promise<LocalBackupEntry[]>;
  restoreLocalBackup: (fileName: string) => Promise<RestoreLocalBackupResult>;
}

const LOCAL_LIVE_BACKUP_DEBOUNCE_MS = 5000;

export function createLocalBackupService(dependencies: LocalBackupServiceDependencies): LocalBackupService {
  let localBackupQueue: Promise<void> = Promise.resolve();
  let localBackupTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingLocalBackupReason: string | null = null;

  const writeLocalBackupArtifacts = async (reason: string): Promise<void> => {
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      return;
    }

    const backupDirectory = getLocalBackupDirectory();
    await mkdir(backupDirectory, { recursive: true });

    let backupLock: DatabaseLockInfo;
    try {
      backupLock = await dependencies.acquireLock(currentStatus.path);
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
        return;
      }
      throw error;
    }

    const backupLockPath = dependencies.getLockPath(currentStatus.path);
    const backupLockHeartbeat = dependencies.startDatabaseLockHeartbeat(backupLockPath, backupLock);

    try {
      const now = new Date().toISOString();
      const backupTimestamp = backupTimestampForFileName();
      const records = dependencies.readAllPersistedRecords(currentDatabase);
      const payload = {
        createdAt: now,
        sourceDatabasePath: currentStatus.path,
        reason,
        recordCount: records.length,
        records,
      };
      const serializedPayload = JSON.stringify(payload, null, 2);

      const shouldRotateBackup = await shouldCreateRotatedLocalBackup(reason);

      await writeFile(getLocalBackupJsonPath(), serializedPayload, 'utf8');
      if (shouldRotateBackup) {
        await writeFile(getRotatedLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
      }
      await pruneRotatedLocalBackups('json');

      try {
        await copyFile(currentStatus.path, getLocalBackupDatabasePath());
        if (shouldRotateBackup) {
          await copyFile(currentStatus.path, getRotatedLocalBackupDatabasePath(backupTimestamp));
        }
        await pruneRotatedLocalBackups('sqlite');
      } catch (error) {
        console.warn('No se ha podido copiar la base SQLite activa al respaldo local.', error);
      }

      try {
        await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
      } catch (error) {
        console.warn('No se ha podido crear la copia SQLite en la carpeta compartida.', error);
      }

      try {
        const dailyBackupPreferences = await readDatabasePreferences();
        await writeDailyLocalBackup(currentStatus.path, dailyBackupPreferences, getDailyLocalBackupWeekdayName);
      } catch (error) {
        console.warn('No se ha podido crear la copia diaria local SQLite.', error);
      }

      try {
        const secondaryDir = (await readDatabasePreferences()).secondaryBackupDirectoryPath;
        if (secondaryDir) {
          await mkdir(secondaryDir, { recursive: true });
          await writeFile(path.join(secondaryDir, LOCAL_BACKUP_JSON_FILE_NAME), serializedPayload, 'utf8');
          if (shouldRotateBackup) {
            await writeFile(path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.json`), serializedPayload, 'utf8');
          }
          await copyFile(currentStatus.path, path.join(secondaryDir, LOCAL_BACKUP_DATABASE_FILE_NAME));
          if (shouldRotateBackup) {
            await copyFile(currentStatus.path, path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.sqlite`));
          }
        }
      } catch (error) {
        console.warn('No se ha podido crear la copia de respaldo secundaria.', error);
      }
    } finally {
      clearInterval(backupLockHeartbeat);
      await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
        console.warn('No se ha podido liberar el bloqueo SQLite de respaldo local.', error);
      });
    }
  };

  const enqueueLocalBackup = (reason: string): void => {
    pendingLocalBackupReason = pendingLocalBackupReason ? `${pendingLocalBackupReason}, ${reason}` : reason;

    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
    }

    localBackupTimer = setTimeout(() => {
      const reasonToWrite = pendingLocalBackupReason ?? reason;
      pendingLocalBackupReason = null;
      localBackupTimer = null;

      localBackupQueue = localBackupQueue
        .then(() => writeLocalBackupArtifacts(reasonToWrite))
        .catch((error: unknown) => {
          console.warn('No se ha podido actualizar la copia local de respaldo SQLite.', error);
          dependencies.enqueueErrorLogger?.(error);
        });
    }, LOCAL_LIVE_BACKUP_DEBOUNCE_MS);
  };

  const flushPendingLocalBackup = async (): Promise<void> => {
    const reasonToWrite = pendingLocalBackupReason;

    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
      localBackupTimer = null;
    }

    pendingLocalBackupReason = null;
    await localBackupQueue;

    if (reasonToWrite) {
      await writeLocalBackupArtifacts(reasonToWrite);
    }

    await localBackupQueue;
  };

  const writeShutdownLocalBackupArtifacts = async (): Promise<void> => {
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      return;
    }

    const backupDirectory = getLocalShutdownBackupDirectory();
    await mkdir(backupDirectory, { recursive: true });

    let backupLock: DatabaseLockInfo;
    try {
      backupLock = await dependencies.acquireLock(currentStatus.path);
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
        return;
      }
      throw error;
    }

    const backupLockPath = dependencies.getLockPath(currentStatus.path);
    const backupLockHeartbeat = dependencies.startDatabaseLockHeartbeat(backupLockPath, backupLock);

    try {
      const now = new Date().toISOString();
      const backupTimestamp = backupTimestampForFileName();
      const records = dependencies.readAllPersistedRecords(currentDatabase);
      const payload = {
        createdAt: now,
        sourceDatabasePath: currentStatus.path,
        reason: 'shutdown',
        recordCount: records.length,
        records,
      };
      const serializedPayload = JSON.stringify(payload, null, 2);

      await writeFile(getShutdownLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
      await pruneShutdownLocalBackups('json');

      try {
        await copyFile(currentStatus.path, getShutdownLocalBackupDatabasePath(backupTimestamp));
        await pruneShutdownLocalBackups('sqlite');
      } catch (error) {
        console.warn('No se ha podido crear la copia local de cierre SQLite.', error);
      }

      try {
        await writeSharedSqliteBackup(currentStatus.path, backupTimestamp);
      } catch (error) {
        console.warn('No se ha podido crear la copia SQLite de cierre en la carpeta compartida.', error);
      }

      try {
        const dailyBackupPreferences = await readDatabasePreferences();
        await writeDailyLocalBackup(currentStatus.path, dailyBackupPreferences, getDailyLocalBackupWeekdayName);
      } catch (error) {
        console.warn('No se ha podido crear la copia diaria local SQLite de cierre.', error);
      }
    } finally {
      clearInterval(backupLockHeartbeat);
      await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
        console.warn('No se ha podido liberar el bloqueo SQLite de respaldo de cierre.', error);
      });
    }
  };

  const createShutdownLocalBackup = async (): Promise<void> => {
    await flushPendingLocalBackup();
    await writeShutdownLocalBackupArtifacts();
  };

  const createManualLocalBackup = async (): Promise<void> => {
    await flushPendingLocalBackup();
    await writeLocalBackupArtifacts('manual-backup');
  };

  const listLocalBackups = async (): Promise<LocalBackupEntry[]> => {
    await pruneRotatedLocalBackups('json');
    await pruneRotatedLocalBackups('sqlite');
    await pruneShutdownLocalBackups('json');
    await pruneShutdownLocalBackups('sqlite');

    const readBackupEntries = async (
      backupDirectory: string,
      fileNamePredicate: (fileName: string) => boolean,
      idPrefix = '',
    ): Promise<LocalBackupEntry[]> => {
      const entries = await readdir(backupDirectory).catch(() => []);
      const backups = await Promise.all(
        entries
          .filter(fileNamePredicate)
          .map(async (fileName): Promise<LocalBackupEntry | null> => {
            const kind = localBackupKindFromFileName(fileName);
            if (!kind) {
              return null;
            }

            const filePath = path.join(backupDirectory, fileName);
            const fileStat = await stat(filePath).catch(() => null);
            if (!fileStat?.isFile()) {
              return null;
            }

            return {
              id: `${idPrefix}${fileName}`,
              fileName,
              kind,
              path: filePath,
              sizeBytes: fileStat.size,
              createdAt: fileStat.mtime.toISOString(),
              isLiveCopy:
                !idPrefix &&
                (fileName === LOCAL_BACKUP_DATABASE_FILE_NAME || fileName === LOCAL_BACKUP_JSON_FILE_NAME),
            };
          }),
      );

      return backups.filter((entry): entry is LocalBackupEntry => Boolean(entry));
    };

    const [localBackups, shutdownBackups] = await Promise.all([
      readBackupEntries(getLocalBackupDirectory(), isLocalBackupFileName),
      readBackupEntries(getLocalShutdownBackupDirectory(), isShutdownBackupFileName, `${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`),
    ]);

    return [...localBackups, ...shutdownBackups]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  };

  const parseLocalBackupJson = (raw: string): PersistedStorageRecord[] => {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }

    const records = (parsed as Partial<LocalStorageBackupPayload>).records;
    if (!Array.isArray(records)) {
      return [];
    }

    return records.filter(
      (record): record is PersistedStorageRecord =>
        Boolean(record) &&
        typeof (record as Partial<PersistedStorageRecord>).key === 'string' &&
        typeof (record as Partial<PersistedStorageRecord>).value === 'string',
    );
  };

  const restoreLocalBackup = async (fileName: string): Promise<RestoreLocalBackupResult> => {
    const currentStatus = dependencies.getStatus();
    const backupReference = resolveLocalBackupReference(
      fileName,
      getLocalBackupDirectory(),
      getLocalShutdownBackupDirectory(),
    );

    if (!backupReference) {
      return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
    }

    const { safeFileName, backupPath } = backupReference;
    const kind = localBackupKindFromFileName(safeFileName);
    if (!kind) {
      return { ok: false, status: currentStatus, message: 'Copia de respaldo no válida.' };
    }

    const backupStat = await stat(backupPath).catch(() => null);
    if (!backupStat?.isFile()) {
      return { ok: false, status: currentStatus, message: 'La copia de respaldo no existe.' };
    }

    if (kind === 'json') {
      const records = parseLocalBackupJson(await readFile(backupPath, 'utf8'));
      if (records.length === 0) {
        return { ok: false, status: currentStatus, message: 'El respaldo JSON no contiene registros recuperables.' };
      }

      if (currentStatus.ready && currentStatus.phase === 'active') {
        enqueueLocalBackup(`pre-restore:${safeFileName}`);
      }

      const nextStatus = await dependencies.migrateLocalStorageSnapshot({ records });
      return {
        ok: nextStatus.ready && nextStatus.phase === 'active',
        status: nextStatus,
        message:
          nextStatus.ready && nextStatus.phase === 'active'
            ? 'Copia JSON restaurada. Reinicia o recarga la app para aplicar la caché recuperada.'
            : (nextStatus.message ?? 'No se ha podido restaurar el respaldo JSON.'),
      };
    }

    const configuredDirectory = await getConfiguredDatabaseDirectory();
    const targetDatabasePath = getDatabasePathForDirectory(configuredDirectory.directoryPath);

    try {
      await mkdir(path.dirname(targetDatabasePath), { recursive: true });

      await dependencies.withDatabaseOperationLock(targetDatabasePath, async () => {
        if (currentStatus.ready) {
          await dependencies.backupExistingDatabase(currentStatus.path);
        } else {
          await copyFile(targetDatabasePath, `${targetDatabasePath}.backup-${backupTimestampForFileName()}`).catch(
            () => undefined,
          );
        }

        await dependencies.closeDatabaseAndReleaseLock();
        await unlink(`${targetDatabasePath}-wal`).catch(() => undefined);
        await unlink(`${targetDatabasePath}-shm`).catch(() => undefined);
        await copyFile(backupPath, targetDatabasePath);
      });

      const nextStatus = await dependencies.activateDatabase(
        configuredDirectory.directoryPath,
        configuredDirectory.isDefaultPath,
        null,
      );
      enqueueLocalBackup(`restore:${safeFileName}`);

      return {
        ok: nextStatus.ready && nextStatus.phase === 'active',
        status: nextStatus,
        message: 'Copia SQLite restaurada. Reinicia o recarga la app para aplicar los datos recuperados.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se ha podido restaurar el respaldo SQLite.';
      return { ok: false, status: dependencies.getStatus(), message };
    }
  };

  return {
    enqueueLocalBackup,
    flushPendingLocalBackup,
    createShutdownLocalBackup,
    createManualLocalBackup,
    listLocalBackups,
    restoreLocalBackup,
  };
}
