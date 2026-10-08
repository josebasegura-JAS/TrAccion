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
  backupSqliteDatabase,
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

export interface ShutdownBackupMetrics {
  totalMs: number;
  prepareMs: number;
  jsonMs: number;
  localSqliteMs: number;
  sharedSqliteMs: number;
  dailySqliteMs: number;
}

export interface LocalBackupService {
  enqueueLocalBackup: (reason: string) => void;
  flushPendingLocalBackup: () => Promise<void>;
  createShutdownLocalBackup: () => Promise<ShutdownBackupMetrics>;
  createManualLocalBackup: () => Promise<void>;
  listLocalBackups: () => Promise<LocalBackupEntry[]>;
  restoreLocalBackup: (fileName: string) => Promise<RestoreLocalBackupResult>;
}

const LOCAL_LIVE_BACKUP_DEBOUNCE_MS = 5000;

export function createLocalBackupService(dependencies: LocalBackupServiceDependencies): LocalBackupService {
  let localBackupQueue: Promise<void> = Promise.resolve();
  let localBackupTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingLocalBackupReason: string | null = null;
  // Revisión de cambios de esta sesión. Si todos los cambios ya están incluidos
  // en una copia viva completada, repetir un backup completo al cerrar solo
  // añade varios segundos de E/S sobre la base compartida sin aportar datos nuevos.
  let backupRevision = 0;
  let backedUpRevision = 0;

  const writeLocalBackupArtifacts = async (reason: string): Promise<boolean> => {
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      return false;
    }

    const backupDirectory = getLocalBackupDirectory();
    await mkdir(backupDirectory, { recursive: true });

    let backupLock: DatabaseLockInfo;
    try {
      backupLock = await dependencies.acquireLock(currentStatus.path);
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
        return false;
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

      let coreSqliteBackupOk = true;
      const liveSnapshotPath = getLocalBackupDatabasePath();
      try {
        await backupSqliteDatabase(currentDatabase, currentStatus.path, liveSnapshotPath);
        if (shouldRotateBackup) {
          await copyFile(liveSnapshotPath, getRotatedLocalBackupDatabasePath(backupTimestamp));
        }
        await pruneRotatedLocalBackups('sqlite');
      } catch (error) {
        coreSqliteBackupOk = false;
        console.warn('No se ha podido copiar la base SQLite activa al respaldo local.', error);
      }

      try {
        await writeSharedSqliteBackup(currentStatus.path, backupTimestamp, liveSnapshotPath);
      } catch (error) {
        coreSqliteBackupOk = false;
        console.warn('No se ha podido crear la copia SQLite en la carpeta compartida.', error);
      }

      try {
        const dailyBackupPreferences = await readDatabasePreferences();
        await writeDailyLocalBackup(
          currentStatus.path,
          dailyBackupPreferences,
          getDailyLocalBackupWeekdayName,
          liveSnapshotPath,
        );
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
          await copyFile(liveSnapshotPath, path.join(secondaryDir, LOCAL_BACKUP_DATABASE_FILE_NAME));
          if (shouldRotateBackup) {
            await copyFile(
              liveSnapshotPath,
              path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.sqlite`),
            );
          }
        }
      } catch (error) {
        console.warn('No se ha podido crear la copia de respaldo secundaria.', error);
      }

      return coreSqliteBackupOk;
    } finally {
      clearInterval(backupLockHeartbeat);
      await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
        console.warn('No se ha podido liberar el bloqueo SQLite de respaldo local.', error);
      });
    }
  };

  const enqueueLocalBackup = (reason: string): void => {
    backupRevision += 1;
    pendingLocalBackupReason = pendingLocalBackupReason ? `${pendingLocalBackupReason}, ${reason}` : reason;

    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
    }

    localBackupTimer = setTimeout(() => {
      const reasonToWrite = pendingLocalBackupReason ?? reason;
      const revisionToBackup = backupRevision;
      pendingLocalBackupReason = null;
      localBackupTimer = null;

      localBackupQueue = localBackupQueue
        .then(async () => {
          const ok = await writeLocalBackupArtifacts(reasonToWrite);
          if (ok) backedUpRevision = Math.max(backedUpRevision, revisionToBackup);
        })
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
      const revisionToBackup = backupRevision;
      const ok = await writeLocalBackupArtifacts(reasonToWrite);
      if (ok) backedUpRevision = Math.max(backedUpRevision, revisionToBackup);
    }

    await localBackupQueue;
  };

  const writeShutdownLocalBackupArtifacts = async (): Promise<ShutdownBackupMetrics> => {
    const totalStartedAt = Date.now();
    const emptyMetrics = (): ShutdownBackupMetrics => ({
      totalMs: Date.now() - totalStartedAt,
      prepareMs: 0,
      jsonMs: 0,
      localSqliteMs: 0,
      sharedSqliteMs: 0,
      dailySqliteMs: 0,
    });
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      return emptyMetrics();
    }

    const backupDirectory = getLocalShutdownBackupDirectory();
    await mkdir(backupDirectory, { recursive: true });

    let backupLock: DatabaseLockInfo;
    try {
      backupLock = await dependencies.acquireLock(currentStatus.path);
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
        return emptyMetrics();
      }
      throw error;
    }

    const backupLockPath = dependencies.getLockPath(currentStatus.path);
    const backupLockHeartbeat = dependencies.startDatabaseLockHeartbeat(backupLockPath, backupLock);

    try {
      const prepareStartedAt = Date.now();
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
      const prepareMs = Date.now() - prepareStartedAt;

      // Se crea una única instantánea SQLite consistente. El resto de copias de
      // cierre se derivan de ella para no lanzar varios backups nativos simultáneos
      // sobre la misma conexión. El JSON puede escribirse en paralelo.
      const jsonTask = (async () => {
        const startedAt = Date.now();
        await writeFile(getShutdownLocalBackupJsonPath(backupTimestamp), serializedPayload, 'utf8');
        await pruneShutdownLocalBackups('json');
        return Date.now() - startedAt;
      })();

      const shutdownSnapshotPath = getShutdownLocalBackupDatabasePath(backupTimestamp);
      const localSqliteTask = (async () => {
        const startedAt = Date.now();
        try {
          await backupSqliteDatabase(currentDatabase, currentStatus.path, shutdownSnapshotPath);
          await pruneShutdownLocalBackups('sqlite');
          return { durationMs: Date.now() - startedAt, ok: true };
        } catch (error) {
          console.warn('No se ha podido crear la copia local de cierre SQLite.', error);
          return { durationMs: Date.now() - startedAt, ok: false };
        }
      })();

      const sharedSqliteTask = (async () => {
        const startedAt = Date.now();
        const localSnapshot = await localSqliteTask;
        if (localSnapshot.ok) {
          try {
            await writeSharedSqliteBackup(currentStatus.path, backupTimestamp, shutdownSnapshotPath);
          } catch (error) {
            console.warn('No se ha podido crear la copia SQLite de cierre en la carpeta compartida.', error);
          }
        }
        return Date.now() - startedAt;
      })();

      const dailySqliteTask = (async () => {
        const startedAt = Date.now();
        const localSnapshot = await localSqliteTask;
        if (localSnapshot.ok) {
          try {
            const dailyBackupPreferences = await readDatabasePreferences();
            await writeDailyLocalBackup(
              currentStatus.path,
              dailyBackupPreferences,
              getDailyLocalBackupWeekdayName,
              shutdownSnapshotPath,
            );
          } catch (error) {
            console.warn('No se ha podido crear la copia diaria local SQLite de cierre.', error);
          }
        }
        return Date.now() - startedAt;
      })();

      const [jsonMs, localSqliteResult, sharedSqliteMs, dailySqliteMs] = await Promise.all([
        jsonTask,
        localSqliteTask,
        sharedSqliteTask,
        dailySqliteTask,
      ]);

      return {
        totalMs: Date.now() - totalStartedAt,
        prepareMs,
        jsonMs,
        localSqliteMs: localSqliteResult.durationMs,
        sharedSqliteMs,
        dailySqliteMs,
      };
    } finally {
      clearInterval(backupLockHeartbeat);
      await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
        console.warn('No se ha podido liberar el bloqueo SQLite de respaldo de cierre.', error);
      });
    }
  };

  const createShutdownLocalBackup = async (): Promise<ShutdownBackupMetrics> => {
    // El backup de cierre es más completo que el backup vivo pendiente. Si el
    // usuario cierra dentro de la ventana de debounce, no tiene sentido escribir
    // primero el mismo estado como backup vivo y repetirlo inmediatamente como
    // backup de cierre. Sí esperamos cualquier backup que ya hubiera empezado.
    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
      localBackupTimer = null;
    }
    const hadPendingChanges = pendingLocalBackupReason !== null;
    pendingLocalBackupReason = null;
    await localBackupQueue;

    // Si esta sesión no ha modificado la base, o la última copia viva ya incluye
    // todas sus escrituras, el backup de cierre sería una repetición byte a byte.
    // Conservamos el backup de cierre completo cuando queda cualquier revisión
    // sin respaldar (por ejemplo, al cerrar inmediatamente después de Guardar).
    if (!hadPendingChanges && backedUpRevision >= backupRevision) {
      return { totalMs: 0, prepareMs: 0, jsonMs: 0, localSqliteMs: 0, sharedSqliteMs: 0, dailySqliteMs: 0 };
    }

    const metrics = await writeShutdownLocalBackupArtifacts();
    backedUpRevision = backupRevision;
    return metrics;
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
    if (configuredDirectory.isDefaultPath) {
      return {
        ok: false,
        status: currentStatus,
        message:
          'No se puede restaurar una copia SQLite sin una base compartida configurada. Selecciona primero su ubicación en Ajustes.',
      };
    }
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
