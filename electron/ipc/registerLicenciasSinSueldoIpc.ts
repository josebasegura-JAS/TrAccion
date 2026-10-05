/**
 * Módulo Licencias sin sueldo, incluyendo selección/lectura de su plantilla Word.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { readFile } from 'node:fs/promises';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { assertDocxPath, validateConditionalJsonRecord } from './ipcHelpers.js';
import { loadLicenciaSinSueldoRecordsSnapshot, saveLicenciaSinSueldoRecordIfUnchanged } from '../sqlitePersistence.js';

export function registerLicenciasSinSueldoIpc(): void {
  ipcMain.handle('licencias-sin-sueldo:load-records', () =>
    enqueueSqliteIpc('licencias-sin-sueldo:load-records', () => loadLicenciaSinSueldoRecordsSnapshot()),
  );
  ipcMain.handle('licencias-sin-sueldo:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de licencia sin sueldo inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('licencias-sin-sueldo:save-record-if-unchanged', () =>
      saveLicenciaSinSueldoRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('licencias-sin-sueldo:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Licencia sin sueldo',
      properties: ['openFile'],
      filters: [{ name: 'Documento Word', extensions: ['docx'] }],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle('licencias-sin-sueldo:read-template', async (_event, filePath: string) => {
    assertDocxPath(filePath);
    const fileBuffer = await readFile(filePath);
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  });
  ipcMain.handle('excedencia:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Excedencia',
      properties: ['openFile'],
      filters: [{ name: 'Documento Word', extensions: ['docx'] }],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0] ?? null;
  });
  ipcMain.handle('excedencia:read-template', async (_event, filePath: string) => {
    assertDocxPath(filePath);
    const fileBuffer = await readFile(filePath);
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  });
}
