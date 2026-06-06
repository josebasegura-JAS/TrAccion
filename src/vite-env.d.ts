/// <reference types="vite/client" />

interface TraccionApi {
  databaseStatus: () => Promise<{
    ready: boolean;
    engine: string;
    phase: string;
  }>;
  selectTeletrabajoTemplate: () => Promise<string | null>;
  readTeletrabajoTemplate: (path: string) => Promise<ArrayBuffer>;
}

interface Window {
  traccion?: TraccionApi;
}
