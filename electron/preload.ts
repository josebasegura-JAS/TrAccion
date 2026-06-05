import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('traccion', {
  databaseStatus: () => ipcRenderer.invoke('database:status'),
});
