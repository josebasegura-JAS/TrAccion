/**
 * Módulo Licencias sin sueldo, incluyendo selección/lectura de su plantilla Word.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { readFile } from 'node:fs/promises';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { assertDocxPath } from './ipcHelpers.js';
import { getSqliteStatus, loadLicenciaSinSueldoRecordsSnapshot, saveLicenciaSinSueldoRecordIfUnchanged } from '../sqlitePersistence.js';

export function registerLicenciasSinSueldoIpc(): void {
  ipcMain.handle('licencias-sin-sueldo:load-records', () =>
    enqueueSqliteIpc('licencias-sin-sueldo:load-records', () => loadLicenciaSinSueldoRecordsSnapshot()),
  );
  ipcMain.handle('licencias-sin-sueldo:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de licencia sin sueldo inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de licencia sin sueldo inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('licencias-sin-sueldo:save-record-if-unchanged', () =>
      saveLicenciaSinSueldoRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
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
}
