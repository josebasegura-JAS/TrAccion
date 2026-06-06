import type { IpcRenderer } from 'electron';

const { contextBridge, ipcRenderer } = require('electron') as {
  contextBridge: Electron.ContextBridge;
  ipcRenderer: IpcRenderer;
};

const createOutlookDraft = (payload: unknown): Promise<unknown> =>
  ipcRenderer.invoke('especiales:create-outlook-draft', payload);

contextBridge.exposeInMainWorld('traccion', {
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
  createOutlookDraft,
});

contextBridge.exposeInMainWorld('rrllOutlook', {
  createDraft: createOutlookDraft,
});
