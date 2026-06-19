import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const createOutlookDraft = (payload: unknown) =>
  ipcRenderer.invoke('especiales:create-outlook-draft', payload);

const createOutlookCalendar = (payload: unknown) =>
  ipcRenderer.invoke('actas:create-outlook-calendar', payload);

const parseOutlookMsg = (payload: unknown) => ipcRenderer.invoke('msg:parseOutlookMsg', payload);

contextBridge.exposeInMainWorld('traccion', {
  notifyBootVisible: () => ipcRenderer.send('app:boot-visible'),
  notifyRendererReady: () => ipcRenderer.send('app:renderer-ready'),
  getWindowsUser: () => ipcRenderer.invoke('app:get-windows-user'),
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectDatabaseDirectory: () => ipcRenderer.invoke('database:select-directory'),
  resetDatabaseDirectory: () => ipcRenderer.invoke('database:reset-directory'),
  getSecondaryBackupDirectory: () => ipcRenderer.invoke('database:get-secondary-backup-directory'),
  setSecondaryBackupDirectory: () => ipcRenderer.invoke('database:set-secondary-backup-directory'),
  clearSecondaryBackupDirectory: () => ipcRenderer.invoke('database:clear-secondary-backup-directory'),
  listLocalBackups: () => ipcRenderer.invoke('database:list-local-backups'),
  restoreLocalBackup: (id: string) => ipcRenderer.invoke('database:restore-local-backup', { id }),
  loadPersistedRecords: () => ipcRenderer.invoke('database:load-persisted-records'),
  getPersistedRecord: (key: string) =>
    ipcRenderer.invoke('database:get-persisted-record', { key }),
  getPersistedRecordsToken: () => ipcRenderer.invoke('database:get-persisted-records-token'),
  getSqliteSyncTokens: () => ipcRenderer.invoke('database:get-sqlite-sync-tokens'),
  onDatabaseConnectivityIssue: (listener: (payload: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown) => listener(payload);
    ipcRenderer.on('database:connectivity-issue', handler);
    return () => ipcRenderer.removeListener('database:connectivity-issue', handler);
  },
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
  loadSorteosRecords: () => ipcRenderer.invoke('sorteos:load-records'),
  saveSorteosSnapshotIfUnchanged: (snapshot: {
    draws: Array<{ id: string; value: string }>;
    exclusions: Array<{ id: string; value: string }>;
    expectedDrawsUpdatedAt: string | null;
    expectedExclusionsUpdatedAt: string | null;
  }) => ipcRenderer.invoke('sorteos:save-snapshot-if-unchanged', snapshot),
  loadEmployeeRecords: () => ipcRenderer.invoke('plantilla:load-records'),
  saveEmployeeRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedValue: string | null;
  }) => ipcRenderer.invoke('plantilla:save-record-if-unchanged', record),
  saveEmployeeRecordsIfUnchanged: (records: Array<{
    id: string;
    value: string;
    expectedValue: string | null;
  }>) => ipcRenderer.invoke('plantilla:save-records-if-unchanged', { records }),
  loadTaskRecords: (filter?: { mode?: 'all' | 'active' | 'historical' }) =>
    ipcRenderer.invoke('tasks:load-records', filter),
  saveTaskRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('tasks:save-record-if-unchanged', record),
  loadComiteSessionRecords: () => ipcRenderer.invoke('comite:load-records'),
  saveComiteSessionRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('comite:save-record-if-unchanged', record),
  loadParitariaSessionRecords: () => ipcRenderer.invoke('paritaria:load-records'),
  saveParitariaSessionRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('paritaria:save-record-if-unchanged', record),
  loadActaRecords: () => ipcRenderer.invoke('actas:load-records'),
  saveActaRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('actas:save-record-if-unchanged', record),
  loadVinculogramaRecords: () => ipcRenderer.invoke('vinculograma:load-records'),
  saveVinculogramaRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('vinculograma:save-record-if-unchanged', record),
  loadCriteriosRrllRecords: () => ipcRenderer.invoke('criterios-rrll:load-records'),
  saveCriteriosRrllRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('criterios-rrll:save-record-if-unchanged', record),
  loadEspecialesRecipientRecords: () => ipcRenderer.invoke('especiales:load-recipient-records'),
  saveEspecialesRecipientRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('especiales:save-recipient-record-if-unchanged', record),
  loadConfiguracion: () => ipcRenderer.invoke('configuracion:load'),
  saveConfiguracionIfUnchanged: (record: {
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('configuracion:save-if-unchanged', record),
  selectTaskDocument: () => ipcRenderer.invoke('tasks:select-document'),
  openTaskDocument: (filePath: string) => ipcRenderer.invoke('tasks:open-document', filePath),
  loadTeletrabajoRecords: () => ipcRenderer.invoke('teletrabajo:load-records'),
  saveTeletrabajoRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('teletrabajo:save-record-if-unchanged', record),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
  loadLicenciaSinSueldoRecords: () => ipcRenderer.invoke('licencias-sin-sueldo:load-records'),
  saveLicenciaSinSueldoRecordIfUnchanged: (record: {
    id: string;
    value: string;
    expectedUpdatedAt: string | null;
  }) => ipcRenderer.invoke('licencias-sin-sueldo:save-record-if-unchanged', record),
  selectLicenciaSinSueldoTemplate: () =>
    ipcRenderer.invoke('licencias-sin-sueldo:select-template'),
  readLicenciaSinSueldoTemplate: (path: string) =>
    ipcRenderer.invoke('licencias-sin-sueldo:read-template', path),
  openTeletrabajoWord: (buffer: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('teletrabajo:open-word', { buffer, fileName }),
  openExcelWorkbook: (buffer: ArrayBuffer, fileName: string) =>
    ipcRenderer.invoke('excel:open-workbook', { buffer, fileName }),
  createOutlookDraft,
  createOutlookCalendar,
  parseOutlookMsg,
  extractDocxText: (payload: ArrayBuffer) => ipcRenderer.invoke('docx:extract-text', payload),
});

// Compatibilidad con el módulo Especiales de RRLL Dashboard y con builds intermedias.
contextBridge.exposeInMainWorld('rrllOutlook', {
  createDraft: createOutlookDraft,
  createCalendar: createOutlookCalendar,
});

contextBridge.exposeInMainWorld('rrllMsg', {
  parseOutlookMsg,
});
