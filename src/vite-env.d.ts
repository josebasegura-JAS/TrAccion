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

interface TraccionApi {
  databaseStatus: () => Promise<{
    ready: boolean;
    engine: string;
    phase: string;
  }>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
  createOutlookDraft: (payload: EspecialOutlookDraftPayload) => Promise<EspecialOutlookDraftResult>;
}

interface Window {
  traccion?: TraccionApi;
}
