/**
 * Ciclo de vida de la base de datos (estado, directorio, backups, vacuum, lock de sesión), auto-actualización de la app y bloqueos de registro (recordLock:*).
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { applyAppUpdate, checkForAppUpdate } from '../appUpdate.js';
import { userInfo } from 'node:os';
import {
  acquireRecordLock,
  changeSqliteDirectory,
  createLocalStorageBackup,
  createManualLocalBackup,
  getPersistedRecordSnapshot,
  getRecordLock,
  getSqliteStatus,
  heartbeatRecordLock,
  listLocalBackups,
  loadPersistedRecordsSnapshot,
  getPersistedRecordsTokenSnapshot,
  getSqliteSyncTokensSnapshot,
  migrateLocalStorageSnapshot,
  releaseRecordLock,
  resetSqliteDirectory,
  restoreLocalBackup,
  savePersistedRecord,
  savePersistedRecordIfUnchanged,
  getSecondaryBackupDirectory,
  setSecondaryBackupDirectory,
  clearSecondaryBackupDirectory,
  getUpdatesDirectory,
  setUpdatesDirectory,
  clearUpdatesDirectory,
  getDailyLocalBackupSettings,
  setDailyLocalBackupEnabled,
  setDailyLocalBackupRetentionDays,
  setDailyLocalBackupDirectory,
  clearDailyLocalBackupDirectory,
  getVacuumStatus,
  vacuumDatabaseNow,
  runDataIntegrityAuditNow,
  getCurrentDatabaseLockInfo,
  forceReleaseDatabaseLock,
} from '../sqlitePersistence.js';

function normalizeRecordLockPayload(payload: unknown): { module: string; recordId: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidate = payload as { module?: unknown; recordId?: unknown };
  if (typeof candidate.module !== 'string' || typeof candidate.recordId !== 'string') {
    return null;
  }

  const moduleName = candidate.module.trim();
  const recordId = candidate.recordId.trim();
  if (!moduleName || !recordId) {
    return null;
  }

  return { module: moduleName, recordId };
}

export function registerCoreDatabaseIpc(): void {
  ipcMain.handle('app:get-windows-user', () => {
    try {
      return userInfo().username || 'Usuario local';
    } catch {
      return 'Usuario local';
    }
  });
  ipcMain.handle('database:status', () => getSqliteStatus());
  ipcMain.handle('database:select-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta para la base SQLite de TrAccion',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return getSqliteStatus();
    }

    const selectedDirectory = result.filePaths[0];
    if (!selectedDirectory) {
      return getSqliteStatus();
    }

    return enqueueSqliteIpc('database:select-directory', () =>
      changeSqliteDirectory(selectedDirectory),
    );
  });
  ipcMain.handle('database:reset-directory', () =>
    enqueueSqliteIpc('database:reset-directory', () => resetSqliteDirectory()),
  );
  ipcMain.handle('database:get-secondary-backup-directory', () => getSecondaryBackupDirectory());
  ipcMain.handle('database:set-secondary-backup-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta de respaldo secundario',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, path: null };
    }

    await setSecondaryBackupDirectory(result.filePaths[0]);
    return { ok: true, path: result.filePaths[0] };
  });
  ipcMain.handle('database:clear-secondary-backup-directory', async () => {
    await clearSecondaryBackupDirectory();
    return { ok: true };
  });
  ipcMain.handle('app-update:get-updates-directory', () => getUpdatesDirectory());
  ipcMain.handle('app-update:set-updates-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta de actualizaciones de TrAccion',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, path: null };
    }

    await setUpdatesDirectory(result.filePaths[0]);
    return { ok: true, path: result.filePaths[0] };
  });
  ipcMain.handle('app-update:clear-updates-directory', async () => {
    await clearUpdatesDirectory();
    return { ok: true };
  });
  ipcMain.handle('app-update:check', async () => {
    const updatesDirectoryPath = await getUpdatesDirectory();
    return checkForAppUpdate(app.getVersion(), updatesDirectoryPath);
  });
  ipcMain.handle('app-update:apply', async () => {
    const updatesDirectoryPath = await getUpdatesDirectory();
    const result = await applyAppUpdate(updatesDirectoryPath);
    if (result.ok) {
      // app.quit() dispara el cierre ordenado habitual (copia de seguridad
      // de SQLite incluida vía el listener de before-quit ya existente); el
      // .bat lanzado por applyAppUpdate espera a que este proceso muera de
      // verdad antes de sustituir el .exe y relanzar.
      setImmediate(() => app.quit());
    }
    return result;
  });
  ipcMain.handle('database:get-daily-local-backup-settings', () => getDailyLocalBackupSettings());
  ipcMain.handle('database:set-daily-local-backup-enabled', async (_event, payload: unknown) => {
    const candidate = payload as { enabled?: unknown } | null;
    const enabled = typeof candidate?.enabled === 'boolean' ? candidate.enabled : true;
    await setDailyLocalBackupEnabled(enabled);
    return getDailyLocalBackupSettings();
  });
  ipcMain.handle(
    'database:set-daily-local-backup-retention-days',
    async (_event, payload: unknown) => {
      const candidate = payload as { retentionDays?: unknown } | null;
      const retentionDays =
        typeof candidate?.retentionDays === 'number' ? candidate.retentionDays : 7;
      await setDailyLocalBackupRetentionDays(retentionDays);
      return getDailyLocalBackupSettings();
    },
  );
  ipcMain.handle('database:set-daily-local-backup-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta para la copia diaria local',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, settings: await getDailyLocalBackupSettings() };
    }

    await setDailyLocalBackupDirectory(result.filePaths[0]);
    return { ok: true, settings: await getDailyLocalBackupSettings() };
  });
  ipcMain.handle('database:clear-daily-local-backup-directory', async () => {
    await clearDailyLocalBackupDirectory();
    return getDailyLocalBackupSettings();
  });
  ipcMain.handle('database:list-local-backups', () =>
    enqueueSqliteIpc('database:list-local-backups', () => listLocalBackups()),
  );
  ipcMain.handle('database:create-manual-backup', () =>
    enqueueSqliteIpc('database:create-manual-backup', async () => {
      await createManualLocalBackup();
      return { ok: true };
    }),
  );
  ipcMain.handle('database:get-vacuum-status', () =>
    enqueueSqliteIpc('database:get-vacuum-status', () => getVacuumStatus()),
  );
  ipcMain.handle('database:vacuum-now', () =>
    enqueueSqliteIpc('database:vacuum-now', () => vacuumDatabaseNow()),
  );
  ipcMain.handle('database:run-integrity-audit', () =>
    enqueueSqliteIpc('database:run-integrity-audit', () => runDataIntegrityAuditNow()),
  );
  ipcMain.handle('database:get-current-lock', () =>
    enqueueSqliteIpc('database:get-current-lock', () => getCurrentDatabaseLockInfo()),
  );
  ipcMain.handle('database:force-release-lock', () =>
    enqueueSqliteIpc('database:force-release-lock', () => forceReleaseDatabaseLock()),
  );
  ipcMain.handle('database:restore-local-backup', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return restoreLocalBackup('');
    }

    const candidate = payload as { id?: unknown };
    return enqueueSqliteIpc('database:restore-local-backup', () =>
      restoreLocalBackup(typeof candidate.id === 'string' ? candidate.id : ''),
    );
  });
  ipcMain.handle('database:load-persisted-records', () =>
    enqueueSqliteIpc('database:load-persisted-records', () => loadPersistedRecordsSnapshot()),
  );
  ipcMain.handle('database:get-persisted-record', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { status: getSqliteStatus(), record: null };
    }

    const candidate = payload as { key?: unknown };
    if (typeof candidate.key !== 'string' || !candidate.key.trim()) {
      return { status: getSqliteStatus(), record: null };
    }

    const key = candidate.key;
    return enqueueSqliteIpc('database:get-persisted-record', () => getPersistedRecordSnapshot(key));
  });
  ipcMain.handle('database:get-persisted-records-token', () =>
    enqueueSqliteIpc('database:get-persisted-records-token', () =>
      getPersistedRecordsTokenSnapshot(),
    ),
  );
  ipcMain.handle('database:get-sqlite-sync-tokens', () =>
    enqueueSqliteIpc('database:get-sqlite-sync-tokens', () => getSqliteSyncTokensSnapshot()),
  );
  ipcMain.handle('database:backup-local-storage', (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { records?: unknown }).records)
    ) {
      return getSqliteStatus();
    }

    return enqueueSqliteIpc('database:backup-local-storage', () =>
      createLocalStorageBackup(payload as { records: { key: string; value: string }[] }),
    );
  });
  ipcMain.handle('database:migrate-local-storage', (_event, payload: unknown) => {
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Array.isArray((payload as { records?: unknown }).records)
    ) {
      return getSqliteStatus();
    }

    return enqueueSqliteIpc('database:migrate-local-storage', () =>
      migrateLocalStorageSnapshot(payload as { records: { key: string; value: string }[] }),
    );
  });
  ipcMain.handle('database:save-local-storage-record', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return getSqliteStatus();
    }

    const candidate = payload as { key?: unknown; value?: unknown };
    if (typeof candidate.key !== 'string' || typeof candidate.value !== 'string') {
      return getSqliteStatus();
    }

    const key = candidate.key;
    const value = candidate.value;
    return enqueueSqliteIpc('database:save-local-storage-record', () =>
      savePersistedRecord({ key, value }),
    );
  });
  ipcMain.handle('database:save-local-storage-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado inválido.',
      };
    }

    const candidate = payload as { key?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.key !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de guardado inválido.',
      };
    }

    const key = candidate.key;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('database:save-local-storage-record-if-unchanged', () =>
      savePersistedRecordIfUnchanged({
        key,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('recordLock:acquire', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? enqueueSqliteIpc('recordLock:acquire', () => acquireRecordLock(normalized))
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });
  ipcMain.handle('recordLock:heartbeat', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    // Los heartbeats son idempotentes y el TTL de 30s tolera alguno perdido;
    // se ejecutan fuera de la cola para no bloquear escrituras de datos.
    return normalized
      ? heartbeatRecordLock(normalized)
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });
  ipcMain.handle('recordLock:release', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? enqueueSqliteIpc('recordLock:release', () => releaseRecordLock(normalized))
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });
  ipcMain.handle('recordLock:get', (_event, payload: unknown) => {
    const normalized = normalizeRecordLockPayload(payload);
    return normalized
      ? enqueueSqliteIpc('recordLock:get', () => getRecordLock(normalized))
      : { ok: false, status: 'error', lock: null, message: 'Identificador de bloqueo inválido.' };
  });
}
