import { contextBridge, ipcRenderer } from 'electron';

const createOutlookDraft = (payload: unknown) =>
  ipcRenderer.invoke('especiales:create-outlook-draft', payload);

const parseOutlookMsg = (payload: unknown) => ipcRenderer.invoke('msg:parseOutlookMsg', payload);

contextBridge.exposeInMainWorld('traccion', {
  notifyBootVisible: () => ipcRenderer.send('app:boot-visible'),
  notifyRendererReady: () => ipcRenderer.send('app:renderer-ready'),
  getWindowsUser: () => ipcRenderer.invoke('app:get-windows-user'),
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectDatabaseDirectory: () => ipcRenderer.invoke('database:select-directory'),
  resetDatabaseDirectory: () => ipcRenderer.invoke('database:reset-directory'),
  listLocalBackups: () => ipcRenderer.invoke('database:list-local-backups'),
  restoreLocalBackup: (id: string) => ipcRenderer.invoke('database:restore-local-backup', { id }),
  loadPersistedRecords: () => ipcRenderer.invoke('database:load-persisted-records'),
  getPersistedRecordsToken: () => ipcRenderer.invoke('database:get-persisted-records-token'),
  backupLocalStorage: (records: { key: string; value: string }[]) =>
    ipcRenderer.invoke('database:backup-local-storage', { records }),
  migrateLocalStorage: (records: { key: string; value: string }[]) =>
    ipcRenderer.invoke('database:migrate-local-storage', { records }),
  saveLocalStorageRecord: (record: { key: string; value: string }) =>
    ipcRenderer.invoke('database:save-local-storage-record', record),
  saveLocalStorageRecordIfUnchanged: (record: {
    key: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('database:save-local-storage-record-if-unchanged', record),
  acquireRecordLock: (payload: { module: string; recordId: string }) =>
    ipcRenderer.invoke('recordLock:acquire', payload),
  heartbeatRecordLock: (payload: { module: string; recordId: string }) =>
    ipcRenderer.invoke('recordLock:heartbeat', payload),
  releaseRecordLock: (payload: { module: string; recordId: string }) =>
    ipcRenderer.invoke('recordLock:release', payload),
  getRecordLock: (payload: { module: string; recordId: string }) =>
    ipcRenderer.invoke('recordLock:get', payload),
  selectTaskDocument: () => ipcRenderer.invoke('tasks:select-document'),
  openTaskDocument: (filePath: string) => ipcRenderer.invoke('tasks:open-document', filePath),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
  selectLicenciaSinSueldoTemplate: () =>
    ipcRenderer.invoke('licencias-sin-sueldo:select-template'),
  readLicenciaSinSueldoTemplate: (path: string) =>
    ipcRenderer.invoke('licencias-sin-sueldo:read-template', path),
  openTeletrabajoWord: (buffer: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('teletrabajo:open-word', { buffer, fileName }),
  openExcelWorkbook: (buffer: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('excel:open-workbook', { buffer, fileName }),
  createOutlookDraft,
  parseOutlookMsg,
  extractDocxText: (payload: ArrayBuffer) => ipcRenderer.invoke('docx:extract-text', payload),
});

// Compatibilidad con el módulo Especiales de RRLL Dashboard y con builds intermedias.
contextBridge.exposeInMainWorld('rrllOutlook', {
  createDraft: createOutlookDraft,
});

contextBridge.exposeInMainWorld('rrllMsg', {
  parseOutlookMsg,
});
