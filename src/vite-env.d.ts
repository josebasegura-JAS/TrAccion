/// <reference types="vite/client" />

interface EspecialOutlookDraftPayload {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

interface EspecialOutlookDraftResult {
  ok: boolean;
  message: string;
}


interface SchoolHelpInspection {
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  attachments: Array<{ name: string; size: number }>;
}

interface SchoolHelpArchiveResult {
  ok: boolean;
  message: string;
  inspection?: SchoolHelpInspection;
  files?: Array<{ originalName: string; savedName: string; savedPath: string }>;
}

interface TraccionApi {
  databaseStatus: () => Promise<{
    ready: boolean;
    engine: string;
    phase: string;
  }>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
  createOutlookDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
  selectSchoolHelpFolder: () => Promise<string | null>;
  inspectSchoolHelpMessage: (fileName: string, buffer: ArrayBuffer) => Promise<SchoolHelpArchiveResult>;
  archiveSchoolHelpMessage: (payload: { fileName: string; buffer: ArrayBuffer; basePath: string; employeeName: string }) => Promise<SchoolHelpArchiveResult>;
}

interface Window {
  traccion?: TraccionApi;
}
