import { contextBridge, ipcRenderer } from 'electron';

const createOutlookDraft = (payload: unknown) =>
  ipcRenderer.invoke('especiales:create-outlook-draft', payload);

const parseOutlookMsg = (payload: unknown) => ipcRenderer.invoke('msg:parseOutlookMsg', payload);

contextBridge.exposeInMainWorld('traccion', {
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
  createOutlookDraft,
  parseOutlookMsg,
});

// Compatibilidad con el módulo Especiales de RRLL Dashboard y con builds intermedias.
contextBridge.exposeInMainWorld('rrllOutlook', {
  createDraft: createOutlookDraft,
});

contextBridge.exposeInMainWorld('rrllMsg', {
  parseOutlookMsg,
});
