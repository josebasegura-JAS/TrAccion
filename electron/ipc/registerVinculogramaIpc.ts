/**
 * Módulo Vinculograma, incluyendo selección/lectura de su plantilla Word.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { readFile } from 'node:fs/promises';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { assertDocxPath, validateConditionalJsonRecord } from './ipcHelpers.js';
import { loadVinculogramaRecordsSnapshot, saveVinculogramaRecordIfUnchanged } from '../sqlitePersistence.js';

export function registerVinculogramaIpc(): void {
  ipcMain.handle('vinculograma:load-records', () =>
    enqueueSqliteIpc('vinculograma:load-records', () => loadVinculogramaRecordsSnapshot()),
  );
  ipcMain.handle('vinculograma:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de vinculograma inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('vinculograma:save-record-if-unchanged', () =>
      saveVinculogramaRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('vinculograma:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Vinculograma',
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
  ipcMain.handle('vinculograma:read-template', async (_event, filePath: string) => {
    assertDocxPath(filePath);
    const fileBuffer = await readFile(filePath);
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  });
}
