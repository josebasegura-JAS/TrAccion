/// <reference types="vite/client" />

interface ElectronParsedOutlookMsgResult {
  ok: boolean;
  message?: string;
  data?: {
    subject: string;
    body: string;
    htmlBody: string;
    senderName: string;
    senderEmail: string;
    date: string;
  };
}

interface EspecialOutlookDraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

interface LegacyEspecialOutlookDraftPayload {
  subject: string;
  htmlBody: string;
  to: string;
  cc: string;
}

interface EspecialOutlookDraftResult {
  ok: boolean;
  message: string;
}

interface EspecialOutlookCalendarPayload {
  subject: string;
  date: string;
  startTime: string;
  endTime: string;
  requiredAttendees: string[];
}

interface EspecialOutlookCalendarResult {
  ok: boolean;
  message: string;
}

interface TeletrabajoOpenWordResult {
  ok: boolean;
  message: string;
}

interface TraccionOpenExcelWorkbookResult {
  ok: boolean;
  message: string;
}

interface TraccionOpenPathResult {
  ok: boolean;
  message: string;
}

interface TraccionDocxTextResult {
  ok: boolean;
  text?: string;
  message?: string;
}

interface TraccionDatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}

interface TraccionDatabaseStatus {
  ready: boolean;
  engine: string;
  phase: string;
  path?: string;
  schemaVersion?: number;
  isDefaultPath?: boolean;
  lockPath?: string;
  lock?: TraccionDatabaseLockInfo;
  message?: string;
}

interface TraccionStorageRecord {
  key: string;
  value: string;
}

interface TraccionStorageRecordSnapshot extends TraccionStorageRecord {
  updatedAt: string;
}

interface TraccionPersistedRecordsTokenSnapshot {
  status: TraccionDatabaseStatus;
  refreshToken: string | null;
  latestUpdatedAt: string | null;
  taskRecordsUpdatedAt?: string | null;
  sorteosDrawsUpdatedAt?: string | null;
  sorteosExclusionsUpdatedAt?: string | null;
  directStoreUpdatedAt?: Record<string, string | null>;
}

interface TraccionPersistedRecordsSnapshot extends TraccionPersistedRecordsTokenSnapshot {
  records: TraccionStorageRecordSnapshot[];
}

interface TraccionPersistedRecordSnapshot {
  status: TraccionDatabaseStatus;
  record: TraccionStorageRecordSnapshot | null;
}

interface TraccionConditionalStorageRecord extends TraccionStorageRecord {
  expectedUpdatedAt: string | null;
}

interface TraccionConditionalStorageSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

interface TraccionLocalBackupEntry {
  id: string;
  fileName: string;
  kind: 'sqlite' | 'json';
  path: string;
  sizeBytes: number;
  createdAt: string;
  isLiveCopy: boolean;
}

interface TraccionRestoreLocalBackupResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  message: string;
}

interface TraccionDailyLocalBackupSettings {
  enabled: boolean;
  retentionDays: number;
  directoryPath: string | null;
}

interface TraccionVacuumStatus {
  lastVacuumAt: string | null;
  currentSizeBytes: number | null;
}

interface TraccionVacuumResult {
  ok: boolean;
  message: string;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  durationMs: number | null;
}

interface TraccionRecordLockOwnerInfo {
  ownerId: string;
  ownerName: string;
  machineName: string;
  acquiredAt: string;
  expiresAt: string;
}

interface TraccionRecordLockPayload {
  module: string;
  recordId: string;
}

interface TraccionRecordLockResult {
  ok: boolean;
  status: 'acquired' | 'released' | 'locked' | 'idle' | 'error';
  lock: TraccionRecordLockOwnerInfo | null;
  message: string;
}

interface TraccionDatabaseConnectivityIssue {
  blocked: boolean;
  message: string;
  failedHeartbeatCount: number;
  updatedAt: string;
}

interface TraccionTaskRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface TraccionEmployeeRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface TraccionEmployeeRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionEmployeeRecord[];
}

interface TraccionConditionalEmployeeRecord {
  id: string;
  value: string;
  expectedValue: string | null;
}

interface TraccionConditionalEmployeeSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentValue: string | null;
  message: string;
}

interface TraccionConditionalEmployeeBatchSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentValue: string | null;
  message: string;
  saved: number;
}

interface TraccionTaskRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTaskRecord[];
}

type TraccionTaskRecordsMode = 'all' | 'active' | 'historical';

interface TraccionTaskRecordsFilter {
  mode?: TraccionTaskRecordsMode;
}

interface TraccionConditionalTaskRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

interface TraccionSorteosRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface TraccionSorteosRecordsSnapshot {
  status: TraccionDatabaseStatus;
  draws: TraccionSorteosRecord[];
  exclusions: TraccionSorteosRecord[];
  drawsUpdatedAt: string | null;
  exclusionsUpdatedAt: string | null;
}

interface TraccionConditionalSorteosSnapshot {
  draws: Array<{ id: string; value: string }>;
  exclusions: Array<{ id: string; value: string }>;
  expectedDrawsUpdatedAt: string | null;
  expectedExclusionsUpdatedAt: string | null;
}

interface TraccionConditionalSorteosSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentDrawsUpdatedAt: string | null;
  currentExclusionsUpdatedAt: string | null;
  message: string;
}

interface TraccionConditionalTaskSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

interface TraccionComiteSessionRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface TraccionComiteSessionRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionComiteSessionRecord[];
}

interface TraccionConditionalComiteSessionRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

type TraccionParitariaSessionRecord = TraccionComiteSessionRecord;

interface TraccionParitariaSessionRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionParitariaSessionRecord[];
}

type TraccionConditionalParitariaSessionRecord = TraccionConditionalComiteSessionRecord;

type TraccionActaRecord = TraccionComiteSessionRecord;

interface TraccionActaRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionActaRecord[];
}

type TraccionConditionalActaRecord = TraccionConditionalComiteSessionRecord;

type TraccionTeletrabajoRecord = TraccionComiteSessionRecord;

interface TraccionTeletrabajoRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTeletrabajoRecord[];
}

type TraccionConditionalTeletrabajoRecord = TraccionConditionalComiteSessionRecord;

type TraccionTeletrabajoPuestoRecord = TraccionComiteSessionRecord;

interface TraccionTeletrabajoPuestoRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTeletrabajoPuestoRecord[];
}

type TraccionConditionalTeletrabajoPuestoRecord = TraccionConditionalComiteSessionRecord;

type TraccionVinculogramaRecord = TraccionComiteSessionRecord;

interface TraccionVinculogramaRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionVinculogramaRecord[];
}

type TraccionConditionalVinculogramaRecord = TraccionConditionalComiteSessionRecord;

type TraccionLicenciaSinSueldoRecord = TraccionComiteSessionRecord;

interface TraccionLicenciaSinSueldoRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionLicenciaSinSueldoRecord[];
}

type TraccionConditionalLicenciaSinSueldoRecord = TraccionConditionalComiteSessionRecord;

type TraccionCriterioRrllRecord = TraccionComiteSessionRecord;

interface TraccionCriteriosRrllRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionCriterioRrllRecord[];
}

type TraccionConditionalCriterioRrllRecord = TraccionConditionalComiteSessionRecord;

type TraccionEspecialRecipientRecord = TraccionComiteSessionRecord;

interface TraccionEspecialRecipientRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionEspecialRecipientRecord[];
}

type TraccionConditionalEspecialRecipientRecord = TraccionConditionalComiteSessionRecord;

interface TraccionConfiguracionSnapshot {
  status: TraccionDatabaseStatus;
  value: string | null;
  updatedAt: string | null;
}

type TraccionPresupuestoRecord = TraccionComiteSessionRecord;

interface TraccionPresupuestosRecordsSnapshot {
  status: TraccionDatabaseStatus;
  scenarios: TraccionPresupuestoRecord[];
  manualItems: TraccionPresupuestoRecord[];
  ticketGroups: TraccionPresupuestoRecord[];
  actuals: TraccionPresupuestoRecord[];
}

interface TraccionConditionalPresupuestosSnapshot {
  scenarios: Array<{ id: string; value: string }>;
  manualItems: Array<{ id: string; value: string }>;
  ticketGroups: Array<{ id: string; value: string }>;
  actuals: Array<{ id: string; value: string }>;
  expectedUpdatedAt: string | null;
}

interface TraccionConditionalConfiguracionRecord {
  value: string;
  expectedUpdatedAt: string | null;
}

interface TraccionApi {
  notifyBootVisible?: () => void;
  notifyRendererReady?: () => void;
  getWindowsUser?: () => Promise<string>;
  databaseStatus: () => Promise<TraccionDatabaseStatus>;
  selectDatabaseDirectory?: () => Promise<TraccionDatabaseStatus>;
  resetDatabaseDirectory?: () => Promise<TraccionDatabaseStatus>;
  getSecondaryBackupDirectory?: () => Promise<string | null>;
  setSecondaryBackupDirectory?: () => Promise<{ ok: boolean; path: string | null }>;
  clearSecondaryBackupDirectory?: () => Promise<{ ok: boolean }>;
  getDailyLocalBackupSettings?: () => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupEnabled?: (enabled: boolean) => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupRetentionDays?: (retentionDays: number) => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupDirectory?: () => Promise<{ ok: boolean; settings: TraccionDailyLocalBackupSettings }>;
  clearDailyLocalBackupDirectory?: () => Promise<TraccionDailyLocalBackupSettings>;
  listLocalBackups?: () => Promise<TraccionLocalBackupEntry[]>;
  createManualBackup?: () => Promise<{ ok: boolean }>;
  getVacuumStatus?: () => Promise<TraccionVacuumStatus>;
  vacuumDatabaseNow?: () => Promise<TraccionVacuumResult>;
  restoreLocalBackup?: (id: string) => Promise<TraccionRestoreLocalBackupResult>;
  loadPersistedRecords?: () => Promise<TraccionPersistedRecordsSnapshot>;
  getPersistedRecord?: (key: string) => Promise<TraccionPersistedRecordSnapshot>;
  getPersistedRecordsToken?: () => Promise<TraccionPersistedRecordsTokenSnapshot>;
  onDatabaseConnectivityIssue?: (
    listener: (payload: TraccionDatabaseConnectivityIssue) => void,
  ) => () => void;
  backupLocalStorage?: (records: TraccionStorageRecord[]) => Promise<TraccionDatabaseStatus>;
  migrateLocalStorage?: (records: TraccionStorageRecord[]) => Promise<TraccionDatabaseStatus>;
  saveLocalStorageRecord?: (record: TraccionStorageRecord) => Promise<TraccionDatabaseStatus>;
  saveLocalStorageRecordIfUnchanged?: (
    record: TraccionConditionalStorageRecord,
  ) => Promise<TraccionConditionalStorageSaveResult>;
  acquireRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  heartbeatRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  releaseRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  getRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  loadSorteosRecords?: () => Promise<TraccionSorteosRecordsSnapshot>;
  saveSorteosSnapshotIfUnchanged?: (
    snapshot: TraccionConditionalSorteosSnapshot,
  ) => Promise<TraccionConditionalSorteosSaveResult>;
  loadEmployeeRecords?: () => Promise<TraccionEmployeeRecordsSnapshot>;
  saveEmployeeRecordIfUnchanged?: (
    record: TraccionConditionalEmployeeRecord,
  ) => Promise<TraccionConditionalEmployeeSaveResult>;
  saveEmployeeRecordsIfUnchanged?: (
    records: TraccionConditionalEmployeeRecord[],
  ) => Promise<TraccionConditionalEmployeeBatchSaveResult>;
  loadTaskRecords?: (filter?: TraccionTaskRecordsFilter) => Promise<TraccionTaskRecordsSnapshot>;
  saveTaskRecordIfUnchanged?: (
    record: TraccionConditionalTaskRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadComiteSessionRecords?: () => Promise<TraccionComiteSessionRecordsSnapshot>;
  saveComiteSessionRecordIfUnchanged?: (
    record: TraccionConditionalComiteSessionRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadParitariaSessionRecords?: () => Promise<TraccionParitariaSessionRecordsSnapshot>;
  saveParitariaSessionRecordIfUnchanged?: (
    record: TraccionConditionalParitariaSessionRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadActaRecords?: () => Promise<TraccionActaRecordsSnapshot>;
  saveActaRecordIfUnchanged?: (
    record: TraccionConditionalActaRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadTeletrabajoRecords?: () => Promise<TraccionTeletrabajoRecordsSnapshot>;
  saveTeletrabajoRecordIfUnchanged?: (
    record: TraccionConditionalTeletrabajoRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadTeletrabajoPuestoRecords?: () => Promise<TraccionTeletrabajoPuestoRecordsSnapshot>;
  saveTeletrabajoPuestoRecordIfUnchanged?: (
    record: TraccionConditionalTeletrabajoPuestoRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadVinculogramaRecords?: () => Promise<TraccionVinculogramaRecordsSnapshot>;
  saveVinculogramaRecordIfUnchanged?: (
    record: TraccionConditionalVinculogramaRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadLicenciaSinSueldoRecords?: () => Promise<TraccionLicenciaSinSueldoRecordsSnapshot>;
  saveLicenciaSinSueldoRecordIfUnchanged?: (
    record: TraccionConditionalLicenciaSinSueldoRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadCriteriosRrllRecords?: () => Promise<TraccionCriteriosRrllRecordsSnapshot>;
  saveCriteriosRrllRecordIfUnchanged?: (
    record: TraccionConditionalCriterioRrllRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadPresupuestosRecords?: () => Promise<TraccionPresupuestosRecordsSnapshot>;
  savePresupuestosSnapshotIfUnchanged?: (
    snapshot: TraccionConditionalPresupuestosSnapshot,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadEspecialesRecipientRecords?: () => Promise<TraccionEspecialRecipientRecordsSnapshot>;
  saveEspecialesRecipientRecordIfUnchanged?: (
    record: TraccionConditionalEspecialRecipientRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadConfiguracion?: () => Promise<TraccionConfiguracionSnapshot>;
  saveConfiguracionIfUnchanged?: (
    record: TraccionConditionalConfiguracionRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  selectTaskDocument?: () => Promise<string[] | null>;
  openTaskDocument?: (filePath: string) => Promise<TraccionOpenPathResult>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
  selectLicenciaSinSueldoTemplate?: () => Promise<string | null>;
  readLicenciaSinSueldoTemplate?: (path: string) => Promise<ArrayBuffer>;
  openTeletrabajoWord?: (
    buffer: ArrayBuffer,
    fileName: string,
  ) => Promise<TeletrabajoOpenWordResult>;
  openExcelWorkbook?: (
    buffer: ArrayBuffer,
    fileName: string,
  ) => Promise<TraccionOpenExcelWorkbookResult>;
  createOutlookDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
  createOutlookCalendar?: (payload: EspecialOutlookCalendarPayload) => Promise<EspecialOutlookCalendarResult>;
  parseOutlookMsg?: (payload: ArrayBuffer) => Promise<ElectronParsedOutlookMsgResult>;
  extractDocxText?: (payload: ArrayBuffer) => Promise<TraccionDocxTextResult>;
}

interface RrllMsgApi {
  parseOutlookMsg: (payload: ArrayBuffer) => Promise<ElectronParsedOutlookMsgResult>;
}

interface RrllOutlookApi {
  createDraft: (
    payload: EspecialOutlookDraftPayload | LegacyEspecialOutlookDraftPayload,
  ) => Promise<EspecialOutlookDraftResult>;
  createCalendar?: (payload: EspecialOutlookCalendarPayload) => Promise<EspecialOutlookCalendarResult>;
}

interface Window {
  traccion?: TraccionApi;
  rrllMsg?: RrllMsgApi;
  rrllOutlook?: RrllOutlookApi;
}
