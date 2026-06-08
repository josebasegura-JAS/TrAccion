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

interface TeletrabajoOpenWordResult {
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
}

interface TraccionPersistedRecordsSnapshot extends TraccionPersistedRecordsTokenSnapshot {
  records: TraccionStorageRecordSnapshot[];
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

interface TraccionApi {
  notifyBootVisible?: () => void;
  notifyRendererReady?: () => void;
  getWindowsUser?: () => Promise<string>;
  databaseStatus: () => Promise<TraccionDatabaseStatus>;
  selectDatabaseDirectory?: () => Promise<TraccionDatabaseStatus>;
  resetDatabaseDirectory?: () => Promise<TraccionDatabaseStatus>;
  listLocalBackups?: () => Promise<TraccionLocalBackupEntry[]>;
  restoreLocalBackup?: (id: string) => Promise<TraccionRestoreLocalBackupResult>;
  loadPersistedRecords?: () => Promise<TraccionPersistedRecordsSnapshot>;
  getPersistedRecordsToken?: () => Promise<TraccionPersistedRecordsTokenSnapshot>;
  backupLocalStorage?: (records: TraccionStorageRecord[]) => Promise<TraccionDatabaseStatus>;
  migrateLocalStorage?: (records: TraccionStorageRecord[]) => Promise<TraccionDatabaseStatus>;
  saveLocalStorageRecord?: (record: TraccionStorageRecord) => Promise<TraccionDatabaseStatus>;
  acquireRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  heartbeatRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  releaseRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  getRecordLock?: (payload: TraccionRecordLockPayload) => Promise<TraccionRecordLockResult>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
  selectLicenciaSinSueldoTemplate?: () => Promise<string | null>;
  readLicenciaSinSueldoTemplate?: (path: string) => Promise<ArrayBuffer>;
  openTeletrabajoWord?: (
    buffer: ArrayBuffer,
    fileName: string,
  ) => Promise<TeletrabajoOpenWordResult>;
  createOutlookDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
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
}

interface Window {
  traccion?: TraccionApi;
  rrllMsg?: RrllMsgApi;
  rrllOutlook?: RrllOutlookApi;
}
