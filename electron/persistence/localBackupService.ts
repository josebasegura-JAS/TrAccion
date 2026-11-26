import { getTraccionEnvironment } from './traccionEnvironment.js';
import { getPersistenceUserDataPath } from './persistenceRuntime.js';
import { testBackupRoot } from './testOutputPaths.js';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Database } from 'better-sqlite3';
import { recordMultiuserMetric } from '../multiuserPerformanceDiagnostics.js';
import { getDailyLocalBackupWeekdayName } from './maintenanceQueries.js';
import {
  isLocalBackupFileName,
  isShutdownBackupFileName,
  localBackupKindFromFileName,
  LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME,
  resolveLocalBackupReference,
} from './backupReference.js';
import {
  publishVerifiedSqliteSnapshot,
  copyBackupAtomically,
  writeBackupJsonAtomically,
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
  readDatabasePreferences,
} from './databasePreferences.js';
import { validateSqliteBackupForRestore } from './sqliteBackupValidation.js';


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
  environment?: string;
  databaseUuid?: string;
  applicationId?: string;
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
  getRestartSafetySnapshot: () => { activeBackupOperations: number; queuedBackupOperations: number; pendingBackupRevisions: number };
  restoreLocalBackup: (fileName: string) => Promise<RestoreLocalBackupResult>;
}

// Los guardados ya son duraderos en SQLite: las copias completas se agrupan
// por ventana temporal, no tras cada modificación de Tareas.
const LOCAL_LIVE_BACKUP_INTERVAL_MS = 15 * 60 * 1000;
const SHARED_BACKUP_MARKER_SUFFIX = '.backup-coordination.json';

type SharedBackupMarker = {
  databaseSize: number;
  databaseMtimeMs: number;
  databaseCtimeMs: number;
};

// Comparación de la huella del fichero EN EL MISMO servidor SMB: evita
// depender de los relojes de los distintos ordenadores. No se omite una copia
// si la marca falta, es ilegible o el fichero SQLite ha cambiado.
async function isSharedSnapshotCurrent(databasePath: string, markerPath: string): Promise<boolean> {
  try {
    const [source, raw] = await Promise.all([stat(databasePath), readFile(markerPath, 'utf8')]);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    const marker = parsed as Partial<SharedBackupMarker>;
    return marker.databaseSize === source.size
      && marker.databaseMtimeMs === source.mtimeMs
      && marker.databaseCtimeMs === source.ctimeMs;
  } catch {
    return false;
  }
}


export function createLocalBackupService(dependencies: LocalBackupServiceDependencies): LocalBackupService {
  let localBackupQueue: Promise<void> = Promise.resolve();
  let localBackupTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingLocalBackupReason: string | null = null;
  // Revisión de cambios de esta sesión. Si todos los cambios ya están incluidos
  // en una copia viva completada, repetir un backup completo al cerrar solo
  // añade varios segundos de E/S sobre la base compartida sin aportar datos nuevos.
  let backupRevision = 0;
  let backedUpRevision = 0;
  let activeBackupOperations = 0;
  let queuedBackupOperations = 0;
  const getRestartSafetySnapshot = () => ({
    activeBackupOperations,
    queuedBackupOperations,
    pendingBackupRevisions: Math.max(0, backupRevision - backedUpRevision),
  });

  const snapshotIdentity = (status: DatabaseStatus) => ({
    databaseUuid: status.databaseUuid ?? '', applicationId: status.applicationId ?? '',
    environment: status.environment ?? '', schemaVersion: status.schemaVersion,
  });

  const backupRoot = (status: DatabaseStatus): string | undefined => getTraccionEnvironment() === 'test'
    ? testBackupRoot(status, getPersistenceUserDataPath()) : undefined;

  const writeLocalBackupArtifacts = async (reason: string, force = false): Promise<boolean> => {
    activeBackupOperations += 1;
    try {
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      return false;
    }

    const startedAt = Date.now();
    const root = backupRoot(currentStatus);
    const backupDirectory = getLocalBackupDirectory(root);
    await mkdir(backupDirectory, { recursive: true });

    // PR8B: compartir la misma cola exclusiva por ruta que las escrituras
    // normales. El gestor de la operación exclusiva mantiene el heartbeat;
    // la adquisición interior conserva la referencia al mismo propietario.
    try {
      return await dependencies.withDatabaseOperationLock(currentStatus.path, async () => {
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

        const acquiredAfterMs = Date.now() - startedAt;
        const backupLockPath = dependencies.getLockPath(currentStatus.path);
        const sharedMarkerPath = `${currentStatus.path}${SHARED_BACKUP_MARKER_SUFFIX}`;

        try {
          // El lock es global entre ordenadores. Si otro equipo ya respaldó
          // exactamente esta revisión de la base, no se duplica la copia.
          if (!force && await isSharedSnapshotCurrent(currentStatus.path, sharedMarkerPath)) {
            recordMultiuserMetric('backup', 'periodic:covered-by-peer', Date.now() - startedAt);
            recordMultiuserMetric('backup', 'periodic:lock-wait', acquiredAfterMs);
            console.info(`[backup-perf] Copia cubierta por otro equipo: esperaLock=${acquiredAfterMs} ms.`);
            return true;
          }
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

          const shouldRotateBackup = await shouldCreateRotatedLocalBackup(reason, root);

          let coreSqliteBackupOk = true;
          const liveSnapshotPath = getLocalBackupDatabasePath(root);
          // Fallar antes de publicar derivados si no existe una instantánea NUEVA.
          // El archivo vigente no se toca hasta validar quick_check e identidad.
          try {
            await publishVerifiedSqliteSnapshot(currentDatabase, liveSnapshotPath, snapshotIdentity(currentStatus));
          } catch (error) {
            console.warn('No se ha podido crear una instantánea SQLite nueva y verificada.', error);
            return false;
          }

          try {
            await writeBackupJsonAtomically(getLocalBackupJsonPath(root), serializedPayload);
            if (shouldRotateBackup) {
              await writeBackupJsonAtomically(getRotatedLocalBackupJsonPath(backupTimestamp, root), serializedPayload);
              await copyBackupAtomically(liveSnapshotPath, getRotatedLocalBackupDatabasePath(backupTimestamp, root));
            }
            await pruneRotatedLocalBackups('json', root);
            await pruneRotatedLocalBackups('sqlite', root);
            await writeSharedSqliteBackup(currentStatus.path, backupTimestamp, liveSnapshotPath);
            const preferences = await readDatabasePreferences();
            await writeDailyLocalBackup(currentStatus.path, preferences, getDailyLocalBackupWeekdayName, liveSnapshotPath, true);
            const secondaryDir = getTraccionEnvironment() === 'test' ? null : preferences.secondaryBackupDirectoryPath;
            if (secondaryDir) {
              await mkdir(secondaryDir, { recursive: true });
              await writeBackupJsonAtomically(path.join(secondaryDir, LOCAL_BACKUP_JSON_FILE_NAME), serializedPayload);
              if (shouldRotateBackup) {
                await writeBackupJsonAtomically(path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.json`), serializedPayload);
              }
              await copyBackupAtomically(liveSnapshotPath, path.join(secondaryDir, LOCAL_BACKUP_DATABASE_FILE_NAME));
              if (shouldRotateBackup) {
                await copyBackupAtomically(liveSnapshotPath, path.join(secondaryDir, `traccion-local-backup-${backupTimestamp}.sqlite`));
              }
            }
          } catch (error) {
            coreSqliteBackupOk = false;
            console.warn('La nueva instantánea SQLite existe, pero no se completaron todas las copias configuradas.', error);
          }

          if (coreSqliteBackupOk) {
            // Solo se publica la marca tras existir copia SQLite local y compartida.
            // El lock impide escrituras concurrentes entre la huella y la marca.
            try {
              const source = await stat(currentStatus.path);
              const marker: SharedBackupMarker = {
                databaseSize: source.size,
                databaseMtimeMs: source.mtimeMs,
                databaseCtimeMs: source.ctimeMs,
              };
              await writeBackupJsonAtomically(sharedMarkerPath, JSON.stringify(marker));
            } catch (error) {
              console.warn('No se ha podido publicar la coordinación de copias SQLite; el siguiente equipo hará su propia copia.', error);
            }
          }
          recordMultiuserMetric('backup', 'periodic:total', Date.now() - startedAt, !coreSqliteBackupOk);
          recordMultiuserMetric('backup', 'periodic:lock-wait', acquiredAfterMs);
          console.info(`[backup-perf] copiaViva=${Date.now() - startedAt} ms, esperaLock=${acquiredAfterMs} ms, éxito=${coreSqliteBackupOk}.`);
          return coreSqliteBackupOk;
        } finally {
          await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
            console.warn('No se ha podido liberar el bloqueo SQLite de respaldo local.', error);
          });
        }
      });
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia local SQLite omitida: lock ocupado al esperar la cola exclusiva.');
        return false;
      }
      throw error;
    }
    } finally {
      activeBackupOperations -= 1;
    }
  };

  const schedulePendingBackup = (): void => {
    if (localBackupTimer || backupRevision <= backedUpRevision) return;
    localBackupTimer = setTimeout(() => {
      localBackupTimer = null;
      const reason = pendingLocalBackupReason ?? 'periodic:pending';
      const revision = backupRevision;
      pendingLocalBackupReason = null;

      queuedBackupOperations += 1;
      localBackupQueue = localBackupQueue
        .then(async () => {
          const ok = await writeLocalBackupArtifacts(reason);
          if (ok) {
            backedUpRevision = Math.max(backedUpRevision, revision);
          } else {
            pendingLocalBackupReason = pendingLocalBackupReason ?? reason;
          }
        })
        .catch((error: unknown) => {
          pendingLocalBackupReason = pendingLocalBackupReason ?? reason;
          console.warn('No se ha podido actualizar la copia local de respaldo SQLite.', error);
          dependencies.enqueueErrorLogger?.(error);
        })
        .finally(() => {
          queuedBackupOperations -= 1;
          // Reintento siempre acotado a una nueva ventana, nunca un ciclo
          // rápido ante contención SMB. Si hubo nuevas escrituras durante
          // la copia también se incluyen en la siguiente ventana.
          schedulePendingBackup();
        });
    }, LOCAL_LIVE_BACKUP_INTERVAL_MS);
    localBackupTimer.unref?.();
  };

  const enqueueLocalBackup = (reason: string): void => {
    backupRevision += 1;
    pendingLocalBackupReason = pendingLocalBackupReason
      ? pendingLocalBackupReason.includes(reason) ? pendingLocalBackupReason : `${pendingLocalBackupReason}, ${reason}`
      : reason;
    // No reiniciar el temporizador por cada cambio.
    schedulePendingBackup();
  };

  const flushPendingLocalBackup = async (): Promise<void> => {
    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
      localBackupTimer = null;
    }
    const reason = pendingLocalBackupReason;
    pendingLocalBackupReason = null;
    await localBackupQueue;
    if (backupRevision > backedUpRevision) {
      const revision = backupRevision;
      const ok = await writeLocalBackupArtifacts(reason ?? 'flush:pending');
      if (ok) backedUpRevision = Math.max(backedUpRevision, revision);
    }
  };

  const writeShutdownLocalBackupArtifacts = async (): Promise<ShutdownBackupMetrics> => {
    activeBackupOperations += 1;
    try {
    const totalStartedAt = Date.now();
    const currentDatabase = dependencies.getDatabase();
    const currentStatus = dependencies.getStatus();
    if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
      throw new Error('No se puede confirmar el backup de cierre: SQLite no está activo.');
    }

    const root = backupRoot(currentStatus);
    const backupDirectory = getLocalShutdownBackupDirectory(root);
    await mkdir(backupDirectory, { recursive: true });

    // PR8B: compartir la misma cola exclusiva por ruta que las escrituras
    // normales. El gestor de la operación exclusiva mantiene el heartbeat;
    // la adquisición interior conserva la referencia al mismo propietario.
    try {
      return await dependencies.withDatabaseOperationLock(currentStatus.path, async () => {
        let backupLock: DatabaseLockInfo;
        try {
          backupLock = await dependencies.acquireLock(currentStatus.path);
        } catch (error) {
          if (dependencies.isLockContentionError(error)) {
            console.info('Copia local SQLite omitida: base compartida ocupada temporalmente.');
            throw new Error('No se puede confirmar el backup de cierre: base compartida ocupada.');
          }
          throw error;
        }

        const backupLockPath = dependencies.getLockPath(currentStatus.path);

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

          const shutdownSnapshotPath = getShutdownLocalBackupDatabasePath(backupTimestamp, root);
          const localStartedAt = Date.now();
          await publishVerifiedSqliteSnapshot(currentDatabase, shutdownSnapshotPath, snapshotIdentity(currentStatus));
          await pruneShutdownLocalBackups('sqlite', root);
          const localSqliteMs = Date.now() - localStartedAt;

          // Esperar cada publicación: no devolver ni cerrar la conexión mientras
          // una tarea de copia siga ejecutándose después del fallo de otra.
          const jsonStartedAt = Date.now();
          await writeBackupJsonAtomically(getShutdownLocalBackupJsonPath(backupTimestamp, root), serializedPayload);
          await pruneShutdownLocalBackups('json', root);
          const jsonMs = Date.now() - jsonStartedAt;
          const sharedStartedAt = Date.now();
          await writeSharedSqliteBackup(currentStatus.path, backupTimestamp, shutdownSnapshotPath);
          const sharedSqliteMs = Date.now() - sharedStartedAt;
          const dailyStartedAt = Date.now();
          const preferences = await readDatabasePreferences();
          await writeDailyLocalBackup(currentStatus.path, preferences, getDailyLocalBackupWeekdayName, shutdownSnapshotPath, true);
          const dailySqliteMs = Date.now() - dailyStartedAt;
          // Una copia secundaria configurada también debe contener la revisión de cierre.
          const secondaryDir = getTraccionEnvironment() === 'test' ? null : preferences.secondaryBackupDirectoryPath;
          if (secondaryDir) {
            await mkdir(secondaryDir, { recursive: true });
            await writeBackupJsonAtomically(path.join(secondaryDir, LOCAL_BACKUP_JSON_FILE_NAME), serializedPayload);
            await copyBackupAtomically(shutdownSnapshotPath, path.join(secondaryDir, LOCAL_BACKUP_DATABASE_FILE_NAME));
          }
          return { totalMs: Date.now() - totalStartedAt, prepareMs, jsonMs, localSqliteMs, sharedSqliteMs, dailySqliteMs };
        } finally {
          await dependencies.releaseLock(backupLockPath, backupLock).catch((error: unknown) => {
            console.warn('No se ha podido liberar el bloqueo SQLite de respaldo de cierre.', error);
          });
        }
      });
    } catch (error) {
      if (dependencies.isLockContentionError(error)) {
        console.info('Copia de cierre omitida: lock ocupado al esperar la cola exclusiva.');
        throw new Error('No se puede confirmar el backup de cierre: base compartida ocupada.');
      }
      throw error;
    }
    } finally {
      activeBackupOperations -= 1;
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

    const revision = backupRevision;
    try {
      const metrics = await writeShutdownLocalBackupArtifacts();
      backedUpRevision = Math.max(backedUpRevision, revision);
      return metrics;
    } catch (error) {
      pendingLocalBackupReason = pendingLocalBackupReason ?? 'shutdown:pending';
      schedulePendingBackup();
      throw error;
    }
  };

  const createManualLocalBackup = async (): Promise<void> => {
    // La solicitud manual hace una sola copia forzada, incluso si un equipo
    // distinto ya publicó un snapshot de la misma revisión.
    if (localBackupTimer) {
      clearTimeout(localBackupTimer);
      localBackupTimer = null;
    }
    await localBackupQueue;
    const revision = backupRevision;
    const ok = await writeLocalBackupArtifacts('manual-backup', true);
    if (ok) {
      backedUpRevision = Math.max(backedUpRevision, revision);
      pendingLocalBackupReason = null;
    } else {
      schedulePendingBackup();
      throw new Error('No se ha podido confirmar la copia SQLite manual. Se conservan las copias anteriores que no se hayan sustituido correctamente.');
    }
  };

  const listLocalBackups = async (): Promise<LocalBackupEntry[]> => {
    const status = dependencies.getStatus();
    if (getTraccionEnvironment() === 'test' && !status.ready) return [];
    const root = backupRoot(status);
    await pruneRotatedLocalBackups('json', root);
    await pruneRotatedLocalBackups('sqlite', root);
    await pruneShutdownLocalBackups('json', root);
    await pruneShutdownLocalBackups('sqlite', root);

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
      readBackupEntries(getLocalBackupDirectory(root), isLocalBackupFileName),
      readBackupEntries(getLocalShutdownBackupDirectory(root), isShutdownBackupFileName, `${LOCAL_SHUTDOWN_BACKUP_DIRECTORY_NAME}/`),
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
      getLocalBackupDirectory(backupRoot(currentStatus)),
      getLocalShutdownBackupDirectory(backupRoot(currentStatus)),
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
        // Restaurar es destructivo: aquí no se difiere el respaldo al
        // siguiente cuarto de hora. Si no puede confirmarse la copia
        // preventiva, cancelar la restauración en lugar de arriesgar datos.
        await flushPendingLocalBackup();
        const protectedBeforeRestore = await writeLocalBackupArtifacts(`pre-restore:${safeFileName}`, true);
        if (!protectedBeforeRestore) {
          return { ok: false, status: currentStatus, message: 'No se ha podido completar la copia preventiva; restauración cancelada.' };
        }
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

    try {
      const databasePreferences = await readDatabasePreferences();
      validateSqliteBackupForRestore(backupPath, {
        expectedDatabaseUuid: databasePreferences.expectedDatabaseUuid,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'El respaldo SQLite no ha superado la validación previa.';
      return { ok: false, status: currentStatus, message };
    }

    // Un lock de operación no demuestra que los demás clientes SMB hayan
    // cerrado sus handles. No reemplazar el fichero activo desde la aplicación.
    return { ok: false, status: currentStatus,
      message: 'Restauración física SQLite requiere mantenimiento exclusivo fuera de TrAcción, con todos los clientes cerrados y acceso al recurso controlado por el administrador. No se ha modificado la base.' };
  };

  return {
    enqueueLocalBackup,
    flushPendingLocalBackup,
    createShutdownLocalBackup,
    createManualLocalBackup,
    listLocalBackups,
    getRestartSafetySnapshot,
    restoreLocalBackup,
  };
}
