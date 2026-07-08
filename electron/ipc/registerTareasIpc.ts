/**
 * Módulo Tareas, incluyendo selección y apertura de documentos vinculados.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { IpcMainInvokeEvent, OpenDialogOptions } from 'electron';
import path from 'node:path';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import {
  getSqliteStatus,
  loadTaskRecordsSnapshot,
  saveTaskRecordIfUnchanged,
  type SqliteTaskRecordsFilter,
} from '../sqlitePersistence.js';

const allowedTaskDocumentExtensions = new Set([
  '.doc',
  '.docx',
  '.pdf',
  '.xls',
  '.xlsx',
  '.xlsm',
  '.msg',
  '.eml',
  '.txt',
  '.rtf',
  '.odt',
  '.ods',
  '.ppt',
  '.pptx',
]);

function assertAllowedTaskDocumentPath(filePath: string): void {
  if (!allowedTaskDocumentExtensions.has(path.extname(filePath).toLowerCase())) {
    throw new Error('Tipo de documento no permitido para abrir desde TrAccion.');
  }
}

async function selectTaskDocumentPaths(event: IpcMainInvokeEvent): Promise<string[] | null> {
  const browserWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: 'Seleccionar documento para vincular a la tarea',
    properties: ['openFile', 'multiSelections'],
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, options)
    : await dialog.showOpenDialog(options);

  return result.canceled ? null : result.filePaths;
}

async function openTaskDocumentPath(filePath: unknown): Promise<{ ok: boolean; message: string }> {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return { ok: false, message: 'Ruta de documento no válida.' };
  }

  const normalizedPath = filePath.trim();

  try {
    assertAllowedTaskDocumentPath(normalizedPath);
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Tipo de documento no permitido.',
    };
  }

  const openError = await shell.openPath(normalizedPath);
  if (openError) {
    return { ok: false, message: openError };
  }

  return { ok: true, message: 'Documento abierto.' };
}

export function registerTareasIpc(): void {
  ipcMain.handle('tasks:load-records', (_event, payload: unknown) => {
    const filter: SqliteTaskRecordsFilter =
      payload && typeof payload === 'object' && 'mode' in payload
        ? { mode: (payload as { mode?: SqliteTaskRecordsFilter['mode'] }).mode }
        : {};
    return enqueueSqliteIpc('tasks:load-records', () => loadTaskRecordsSnapshot(filter));
  });

  ipcMain.handle('tasks:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de tarea inválido.',
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
        message: 'Payload de tarea inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('tasks:save-record-if-unchanged', () =>
      saveTaskRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });

  ipcMain.handle('tasks:select-document', (event) => selectTaskDocumentPaths(event));
  ipcMain.handle('tasks:open-document', (_event, filePath: unknown) =>
    openTaskDocumentPath(filePath),
  );
}
