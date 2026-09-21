import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traccion', {
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
  createOutlookDraft: (payload: unknown) =>
    ipcRenderer.invoke('especiales:create-outlook-draft', payload),
  selectSchoolHelpFolder: () => ipcRenderer.invoke('ayuda-escolar:select-folder'),
  inspectSchoolHelpMessage: (fileName: string, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('ayuda-escolar:inspect-message', fileName, buffer),
  archiveSchoolHelpMessage: (payload: unknown) =>
    ipcRenderer.invoke('ayuda-escolar:archive-message', payload),
});
