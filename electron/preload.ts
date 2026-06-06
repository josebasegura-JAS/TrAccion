import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traccion', {
  databaseStatus: () => ipcRenderer.invoke('database:status'),
  selectTeletrabajoTemplate: () => ipcRenderer.invoke('teletrabajo:select-template'),
  readTeletrabajoTemplate: (path: string) => ipcRenderer.invoke('teletrabajo:read-template', path),
});
