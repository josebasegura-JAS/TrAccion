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

interface TraccionDatabaseStatus {
  ready: boolean;
  engine: string;
  phase: string;
  path?: string;
  schemaVersion?: number;
  message?: string;
}

interface TraccionStorageRecord {
  key: string;
  value: string;
}

interface TraccionApi {
  databaseStatus: () => Promise<TraccionDatabaseStatus>;
  migrateLocalStorage?: (records: TraccionStorageRecord[]) => Promise<TraccionDatabaseStatus>;
  saveLocalStorageRecord?: (record: TraccionStorageRecord) => Promise<TraccionDatabaseStatus>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
  openTeletrabajoWord?: (buffer: ArrayBuffer, fileName: string) => Promise<TeletrabajoOpenWordResult>;
  createOutlookDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
  parseOutlookMsg?: (payload: ArrayBuffer) => Promise<ElectronParsedOutlookMsgResult>;
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
