/**
 * Módulo Tareas, incluyendo selección/apertura de documentos vinculados y
 * mantenimiento automático del Excel compartido de tareas abiertas.
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
import { saveTaskRecordsAtomically } from '../persistence/taskBatchPersistence.js';
import {
  clearOpenTasksWordDirectory,
  getOpenTasksWordDirectory,
  setOpenTasksWordDirectory,
} from '../taskOpenWordPreferences.js';
import { exportOpenTasksWord, type TaskWordExportResult } from '../taskOpenWordExport.js';
import { createDebouncedSerialRefresh } from '../taskExcelRefreshScheduler.js';

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

let lastOpenTasksExcelFailureMessage: string | null = null;

function assertAllowedTaskDocumentPath(filePath: string): void {
  if (!allowedTaskDocumentExtensions.has(path.extname(filePath).toLowerCase())) {
    throw new Error('Tipo de documento no permitido para abrir desde TrAcción.');
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

async function refreshOpenTasksWord(): Promise<TaskWordExportResult> {
  const directoryPath = await getOpenTasksWordDirectory();
  if (!directoryPath) {
    return { ok: true, skipped: true, path: null, count: 0,
      message: 'No hay carpeta configurada para el Excel de tareas abiertas.' };
  }
  const snapshot = await loadTaskRecordsSnapshot({ mode: 'active' });
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return {
      ok: false,
      path: null,
      count: 0,
      message: snapshot.status.message ?? 'SQLite no está activa; no se ha actualizado el Excel.',
    };
  }
  return exportOpenTasksWord(snapshot.records, directoryPath);
}

function showOpenTasksExcelFailure(message: string): void {
  if (lastOpenTasksExcelFailureMessage === message) return;
  lastOpenTasksExcelFailureMessage = message;
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    if (!browserWindow.isDestroyed()) {
      browserWindow.webContents.send('tasks:excel-backup-failed', message);
    }
  }
}

const automaticExcelRefresh = createDebouncedSerialRefresh(
  async () => {
    const result = await enqueueSqliteIpc('tasks:refresh-open-word', refreshOpenTasksWord);
    if (!result.ok) {
      console.warn(`[tareas-excel] ${result.message}`);
      showOpenTasksExcelFailure(result.message);
      return;
    }
    lastOpenTasksExcelFailureMessage = null;
  },
  (error: unknown) => {
    const detail = error instanceof Error ? error.message : String(error);
    const message = `No se ha podido actualizar el Excel de tareas abiertas: ${detail}`;
    console.warn(message, error);
    showOpenTasksExcelFailure(message);
  },
  1500,
);

function scheduleOpenTasksWordRefresh(): void {
  automaticExcelRefresh.schedule();
}

function isAtomicTaskBatchPayload(
  payload: unknown,
): payload is {
  records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }>;
} {
  if (!payload || typeof payload !== 'object' || !('records' in payload)) return false;
  const records = (payload as { records?: unknown }).records;
  return Array.isArray(records) && records.every((record) => {
    if (!record || typeof record !== 'object') return false;
    const candidate = record as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.value === 'string' &&
      (typeof candidate.expectedUpdatedAt === 'string' || candidate.expectedUpdatedAt === null)
    );
  });
}

export function registerTareasIpc(): void {
  ipcMain.handle('tasks:load-records', (_event, payload: unknown) => {
    const candidate = payload && typeof payload === 'object'
      ? payload as { mode?: unknown; id?: unknown }
      : null;
    const filter: SqliteTaskRecordsFilter = {};
    if (candidate && (candidate.mode === 'all' || candidate.mode === 'active' || candidate.mode === 'historical')) {
      filter.mode = candidate.mode;
    }
    if (candidate && typeof candidate.id === 'string' && candidate.id.trim().length > 0 && candidate.id.length <= 256) {
      filter.id = candidate.id;
    }
    return enqueueSqliteIpc('tasks:load-records', () => loadTaskRecordsSnapshot(filter));
  });

  ipcMain.handle('tasks:save-record-if-unchanged', async (_event, payload: unknown) => {
    if (isAtomicTaskBatchPayload(payload)) {
      const result = await enqueueSqliteIpc('tasks:save-records-atomically', () =>
        saveTaskRecordsAtomically(payload.records),
      );
      if (result.ok && result.saved > 0) scheduleOpenTasksWordRefresh();
      return result;
    }

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

    const result = await enqueueSqliteIpc('tasks:save-record-if-unchanged', () =>
      saveTaskRecordIfUnchanged({
        id: candidate.id as string,
        value: candidate.value as string,
        expectedUpdatedAt: candidate.expectedUpdatedAt as string | null,
      }),
    );

    if (result.ok) {
      scheduleOpenTasksWordRefresh();
    }

    return result;
  });

  ipcMain.handle('tasks:get-open-word-directory', () => getOpenTasksWordDirectory());

  ipcMain.handle('tasks:select-open-word-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar carpeta para el Excel automático de tareas abiertas',
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || !result.filePaths[0]) {
      return { ok: false, path: await getOpenTasksWordDirectory(), message: 'Selección cancelada.' };
    }

    const directoryPath = await setOpenTasksWordDirectory(result.filePaths[0]);
    const exportResult = await enqueueSqliteIpc('tasks:refresh-open-word', refreshOpenTasksWord);
    return {
      ok: exportResult.ok,
      path: directoryPath,
      message: exportResult.message,
    };
  });

  ipcMain.handle('tasks:clear-open-word-directory', async () => {
    await clearOpenTasksWordDirectory();
    return { ok: true, path: null, message: 'Carpeta del Excel de tareas eliminada.' };
  });

  ipcMain.handle('tasks:refresh-open-word', () =>
    enqueueSqliteIpc('tasks:refresh-open-word', refreshOpenTasksWord),
  );

  ipcMain.handle('tasks:select-document', (event) => selectTaskDocumentPaths(event));
  ipcMain.handle('tasks:open-document', (_event, filePath: unknown) =>
    openTaskDocumentPath(filePath),
  );
}
