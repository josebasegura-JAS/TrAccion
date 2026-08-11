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
  bcc?: string[];
  attachments?: Array<{ fileName: string; buffer: ArrayBuffer }>;
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

interface TraccionAppUpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  message: string | null;
}

interface TraccionAppUpdateApplyResult {
  ok: boolean;
  message: string;
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

interface TraccionForceReleaseDatabaseLockResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  message: string;
}

interface TraccionDailyLocalBackupSettings {
  enabled: boolean;
  retentionDays: number;
  directoryPath: string | null;
}

interface TraccionTableSizeBreakdownEntry {
  table: string;
  sizeBytes: number;
  rowCount: number;
  isExactSize: boolean;
}

interface TraccionVacuumStatus {
  lastVacuumAt: string | null;
  currentSizeBytes: number | null;
  heaviestTables: TraccionTableSizeBreakdownEntry[];
}

interface TraccionVacuumResult {
  ok: boolean;
  message: string;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  durationMs: number | null;
}

interface TraccionSqliteIntegrityCheckResult {
  ok: boolean;
  problems: string[];
}

interface TraccionSchemaVersionInfo {
  current: number;
  expected: number;
  upToDate: boolean;
}

interface TraccionExpiredLockInfo {
  module: string;
  recordId: string;
  ownerName: string;
  machineName: string;
  expiresAt: string;
}

interface TraccionOrphanCheckResult {
  label: string;
  count: number;
  sampleIds: string[];
}

interface TraccionDataIntegrityReport {
  generatedAt: string;
  databaseReady: boolean;
  sqliteIntegrityCheck: TraccionSqliteIntegrityCheckResult;
  schemaVersion: TraccionSchemaVersionInfo;
  databaseSizeBytes: number | null;
  heaviestTables: TraccionTableSizeBreakdownEntry[];
  expiredLocks: TraccionExpiredLockInfo[];
  orphanChecks: TraccionOrphanCheckResult[];
  mostRecentBackup: { fileName: string; kind: 'sqlite' | 'json'; createdAt: string } | null;
  backupCount: number;
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

interface TraccionBatchSaveResult {
  ok: boolean;
  status: TraccionDatabaseStatus;
  results: TraccionConditionalTaskSaveResult[];
  failedRecordId?: string;
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

type TeletrabajoPuestoRecord = TraccionComiteSessionRecord;

interface TraccionTeletrabajoPuestoRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTeletrabajoPuestoRecord[];
}

type TraccionConditionalTeletrabajoPuestoRecord = TraccionConditionalComiteSessionRecord;

type TraccionTeletrabajoGrupoCoberturaRecord = TraccionComiteSessionRecord;

interface TraccionTeletrabajoGrupoCoberturaRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTeletrabajoGrupoCoberturaRecord[];
}

type TraccionConditionalTeletrabajoGrupoCoberturaRecord = TraccionConditionalComiteSessionRecord;

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

type TraccionActaTypeRecord = TraccionComiteSessionRecord;

interface TraccionActaTypeRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionActaTypeRecord[];
}

type TraccionConditionalActaTypeRecord = TraccionConditionalComiteSessionRecord;

type TraccionTicketRestauranteCalendarRecord = TraccionComiteSessionRecord;

interface TraccionTicketRestauranteCalendarRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTicketRestauranteCalendarRecord[];
}

type TraccionConditionalTicketRestauranteCalendarRecord = TraccionConditionalComiteSessionRecord;

type TraccionTicketRestaurantePersonRecord = TraccionComiteSessionRecord;

interface TraccionTicketRestaurantePersonRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTicketRestaurantePersonRecord[];
}

type TraccionConditionalTicketRestaurantePersonRecord = TraccionConditionalComiteSessionRecord;

type TraccionTicketRestauranteAbsenceRecord = TraccionComiteSessionRecord;

interface TraccionTicketRestauranteAbsenceRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTicketRestauranteAbsenceRecord[];
}

type TraccionConditionalTicketRestauranteAbsenceRecord = TraccionConditionalComiteSessionRecord;

type TraccionTicketRestauranteConfigRecord = TraccionComiteSessionRecord;

interface TraccionTicketRestauranteConfigRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTicketRestauranteConfigRecord[];
}

type TraccionConditionalTicketRestauranteConfigRecord = TraccionConditionalComiteSessionRecord;

type TraccionTicketRestauranteManutencionRecord = TraccionComiteSessionRecord;

interface TraccionTicketRestauranteManutencionRecordsSnapshot {
  status: TraccionDatabaseStatus;
  records: TraccionTicketRestauranteManutencionRecord[];
}

type TraccionConditionalTicketRestauranteManutencionRecord = TraccionConditionalComiteSessionRecord;

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
  getUpdatesDirectory?: () => Promise<string | null>;
  setUpdatesDirectory?: () => Promise<{ ok: boolean; path: string | null }>;
  clearUpdatesDirectory?: () => Promise<{ ok: boolean }>;
  checkForAppUpdate?: () => Promise<TraccionAppUpdateCheckResult>;
  applyAppUpdate?: () => Promise<TraccionAppUpdateApplyResult>;
  getDailyLocalBackupSettings?: () => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupEnabled?: (enabled: boolean) => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupRetentionDays?: (
    retentionDays: number,
  ) => Promise<TraccionDailyLocalBackupSettings>;
  setDailyLocalBackupDirectory?: () => Promise<{
    ok: boolean;
    settings: TraccionDailyLocalBackupSettings;
  }>;
  clearDailyLocalBackupDirectory?: () => Promise<TraccionDailyLocalBackupSettings>;
  listLocalBackups?: () => Promise<TraccionLocalBackupEntry[]>;
  createManualBackup?: () => Promise<{ ok: boolean }>;
  getVacuumStatus?: () => Promise<TraccionVacuumStatus>;
  vacuumDatabaseNow?: () => Promise<TraccionVacuumResult>;
  runDataIntegrityAudit?: () => Promise<TraccionDataIntegrityReport>;
  getCurrentDatabaseLock?: () => Promise<TraccionDatabaseLockInfo | null>;
  forceReleaseDatabaseLock?: () => Promise<TraccionForceReleaseDatabaseLockResult>;
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
  saveTeletrabajoRecordsIfUnchanged?: (
    records: TraccionConditionalTeletrabajoRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadTeletrabajoPuestoRecords?: () => Promise<TraccionTeletrabajoPuestoRecordsSnapshot>;
  saveTeletrabajoPuestoRecordIfUnchanged?: (
    record: TraccionConditionalTeletrabajoPuestoRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  loadTeletrabajoGrupoCoberturaRecords?: () => Promise<TraccionTeletrabajoGrupoCoberturaRecordsSnapshot>;
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged?: (
    record: TraccionConditionalTeletrabajoGrupoCoberturaRecord,
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
  saveCriteriosRrllRecordsIfUnchanged?: (
    records: TraccionConditionalCriterioRrllRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadActaTypeRecords?: () => Promise<TraccionActaTypeRecordsSnapshot>;
  saveActaTypeRecordIfUnchanged?: (
    record: TraccionConditionalActaTypeRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  saveActaTypeRecordsIfUnchanged?: (
    records: TraccionConditionalActaTypeRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadTicketRestauranteCalendarRecords?: () => Promise<TraccionTicketRestauranteCalendarRecordsSnapshot>;
  saveTicketRestauranteCalendarRecordIfUnchanged?: (
    record: TraccionConditionalTicketRestauranteCalendarRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  saveTicketRestauranteCalendarRecordsIfUnchanged?: (
    records: TraccionConditionalTicketRestauranteCalendarRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadTicketRestaurantePersonRecords?: () => Promise<TraccionTicketRestaurantePersonRecordsSnapshot>;
  saveTicketRestaurantePersonRecordIfUnchanged?: (
    record: TraccionConditionalTicketRestaurantePersonRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  saveTicketRestaurantePersonRecordsIfUnchanged?: (
    records: TraccionConditionalTicketRestaurantePersonRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadTicketRestauranteAbsenceRecords?: () => Promise<TraccionTicketRestauranteAbsenceRecordsSnapshot>;
  saveTicketRestauranteAbsenceRecordIfUnchanged?: (
    record: TraccionConditionalTicketRestauranteAbsenceRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  saveTicketRestauranteAbsenceRecordsIfUnchanged?: (
    records: TraccionConditionalTicketRestauranteAbsenceRecord[],
  ) => Promise<TraccionBatchSaveResult>;
  loadTicketRestauranteConfigRecords?: () => Promise<TraccionTicketRestauranteConfigRecordsSnapshot>;
  saveTicketRestauranteConfigRecordIfUnchanged?: (
    record: TraccionConditionalTicketRestauranteConfigRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;

  loadTicketRestauranteManutencionRecords?: () => Promise<TraccionTicketRestauranteManutencionRecordsSnapshot>;
  saveTicketRestauranteManutencionRecordIfUnchanged?: (
    record: TraccionConditionalTicketRestauranteManutencionRecord,
  ) => Promise<TraccionConditionalTaskSaveResult>;
  saveTicketRestauranteManutencionRecordsIfUnchanged?: (
    records: TraccionConditionalTicketRestauranteManutencionRecord[],
  ) => Promise<TraccionBatchSaveResult>;
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
  selectVinculogramaTemplate?: () => Promise<string | null>;
  readVinculogramaTemplate?: (path: string) => Promise<ArrayBuffer>;
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
  createOutlookCalendar?: (
    payload: EspecialOutlookCalendarPayload,
  ) => Promise<EspecialOutlookCalendarResult>;
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
  createCalendar?: (
    payload: EspecialOutlookCalendarPayload,
  ) => Promise<EspecialOutlookCalendarResult>;
}

interface Window {
  traccion?: TraccionApi;
  rrllMsg?: RrllMsgApi;
  rrllOutlook?: RrllOutlookApi;
}
