/**
 * Módulo Teletrabajo: solicitudes, puestos, grupos de cobertura, plantilla Word y apertura del Word generado.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { BrowserWindow, dialog, ipcMain } from 'electron';
import type { OpenDialogOptions } from 'electron';
import { readFile } from 'node:fs/promises';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { openTeletrabajoWord } from '../documentOpener.js';
import { assertDocxPath, validateJsonRecordPayload } from './ipcHelpers.js';
import {
  getSqliteStatus,
  loadTeletrabajoRecordsSnapshot,
  loadTeletrabajoPuestoRecordsSnapshot,
  loadTeletrabajoGrupoCoberturaRecordsSnapshot,
  saveTeletrabajoRecordIfUnchanged,
  saveTeletrabajoRecordsIfUnchanged,
  saveTeletrabajoPuestoRecordIfUnchanged,
  saveTeletrabajoGrupoCoberturaRecordIfUnchanged,
} from '../sqlitePersistence.js';

export function registerTeletrabajoIpc(): void {
  ipcMain.handle('teletrabajo-puestos:load-records', () =>
    enqueueSqliteIpc('teletrabajo-puestos:load-records', () => loadTeletrabajoPuestoRecordsSnapshot()),
  );
  ipcMain.handle('teletrabajo-puestos:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateJsonRecordPayload(payload, 'Payload de puesto teletrabajable inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('teletrabajo-puestos:save-record-if-unchanged', () =>
      saveTeletrabajoPuestoRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('teletrabajo-grupos-cobertura:load-records', () =>
    enqueueSqliteIpc('teletrabajo-grupos-cobertura:load-records', () =>
      loadTeletrabajoGrupoCoberturaRecordsSnapshot(),
    ),
  );
  ipcMain.handle('teletrabajo-grupos-cobertura:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateJsonRecordPayload(payload, 'Payload de grupo de cobertura inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('teletrabajo-grupos-cobertura:save-record-if-unchanged', () =>
      saveTeletrabajoGrupoCoberturaRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('teletrabajo:load-records', () =>
    enqueueSqliteIpc('teletrabajo:load-records', () => loadTeletrabajoRecordsSnapshot()),
  );
  ipcMain.handle('teletrabajo:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de solicitud de Teletrabajo inválido.',
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
        message: 'Payload de solicitud de Teletrabajo inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('teletrabajo:save-record-if-unchanged', () =>
      saveTeletrabajoRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('teletrabajo:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de solicitudes de Teletrabajo inválido.',
    };

    if (!payload || typeof payload !== 'object') {
      return invalidPayloadResult;
    }

    const candidate = payload as { records?: unknown };
    if (!Array.isArray(candidate.records)) {
      return invalidPayloadResult;
    }

    const records: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> = [];
    for (const item of candidate.records) {
      if (!item || typeof item !== 'object') {
        return invalidPayloadResult;
      }
      const recordCandidate = item as { id?: unknown; value?: unknown; expectedUpdatedAt?: unknown };
      if (
        typeof recordCandidate.id !== 'string' ||
        typeof recordCandidate.value !== 'string' ||
        (typeof recordCandidate.expectedUpdatedAt !== 'string' && recordCandidate.expectedUpdatedAt !== null)
      ) {
        return invalidPayloadResult;
      }
      records.push({
        id: recordCandidate.id,
        value: recordCandidate.value,
        expectedUpdatedAt: recordCandidate.expectedUpdatedAt,
      });
    }

    return enqueueSqliteIpc('teletrabajo:save-records-if-unchanged', () =>
      saveTeletrabajoRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('teletrabajo:select-template', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options: OpenDialogOptions = {
      title: 'Seleccionar plantilla de Teletrabajo',
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
  ipcMain.handle('teletrabajo:read-template', async (_event, filePath: string) => {
    assertDocxPath(filePath);
    const fileBuffer = await readFile(filePath);
    return fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength,
    );
  });
  ipcMain.handle('teletrabajo:open-word', async (_event, payload: unknown) =>
    openTeletrabajoWord(payload),
  );
}
