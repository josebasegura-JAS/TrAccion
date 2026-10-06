/**
 * Comité, Paritaria y Actas (comparten el mismo patrón de sesión/registro), más la creación de citas de Outlook para Actas.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { createOutlookCalendar } from '../outlookIntegration.js';
import { updateCommitteeSummaryWord } from '../committeeSummaryWord.js';
import { updateParitariaSummaryWord } from '../paritariaSummaryWord.js';
import {
  getSqliteStatus,
  loadComiteSessionRecordsSnapshot,
  loadParitariaSessionRecordsSnapshot,
  loadActaRecordsSnapshot,
  saveComiteSessionRecordIfUnchanged,
  saveParitariaSessionRecordIfUnchanged,
  saveActaRecordIfUnchanged,
  closeSessionWorkflowAtomically,
} from '../sqlitePersistence.js';

export function registerSesionesIpc(): void {

  ipcMain.handle('comite:update-summary-word', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'Datos inválidos para actualizar el resumen histórico de Comité.' };
    }
    const candidate = payload as { folderPath?: unknown; code?: unknown; date?: unknown; points?: unknown };
    if (
      typeof candidate.folderPath !== 'string' ||
      typeof candidate.code !== 'string' ||
      typeof candidate.date !== 'string' ||
      !Array.isArray(candidate.points) ||
      !candidate.points.every((point) => typeof point === 'string')
    ) {
      return { ok: false, message: 'Datos inválidos para actualizar el resumen histórico de Comité.' };
    }
    return updateCommitteeSummaryWord({
      folderPath: candidate.folderPath,
      code: candidate.code,
      date: candidate.date,
      points: candidate.points,
    });
  });

  ipcMain.handle('paritaria:update-summary-word', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'Datos inválidos para actualizar el resumen histórico de Paritaria.' };
    }
    const candidate = payload as { folderPath?: unknown; code?: unknown; date?: unknown; points?: unknown };
    if (
      typeof candidate.folderPath !== 'string' ||
      typeof candidate.code !== 'string' ||
      typeof candidate.date !== 'string' ||
      !Array.isArray(candidate.points) ||
      !candidate.points.every((point) => typeof point === 'string')
    ) {
      return { ok: false, message: 'Datos inválidos para actualizar el resumen histórico de Paritaria.' };
    }
    return updateParitariaSummaryWord({
      folderPath: candidate.folderPath,
      code: candidate.code,
      date: candidate.date,
      points: candidate.points,
    });
  });

  ipcMain.handle('sessions:close-workflow-atomically', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        message: 'Payload de cierre de sesión inválido.',
      };
    }
    return enqueueSqliteIpc('sessions:close-workflow-atomically', () =>
      closeSessionWorkflowAtomically(payload as Parameters<typeof closeSessionWorkflowAtomically>[0]),
    );
  });
  ipcMain.handle('comite:load-records', () =>
    enqueueSqliteIpc('comite:load-records', () => loadComiteSessionRecordsSnapshot()),
  );
  ipcMain.handle('paritaria:load-records', () =>
    enqueueSqliteIpc('paritaria:load-records', () => loadParitariaSessionRecordsSnapshot()),
  );
  ipcMain.handle('actas:load-records', () =>
    enqueueSqliteIpc('actas:load-records', () => loadActaRecordsSnapshot()),
  );
  ipcMain.handle('comite:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de sesión inválido.',
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
        message: 'Payload de sesión inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('comite:save-record-if-unchanged', () =>
      saveComiteSessionRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('paritaria:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de sesión inválido.',
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
        message: 'Payload de sesión inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('paritaria:save-record-if-unchanged', () =>
      saveParitariaSessionRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('actas:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de acta inválido.',
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
        message: 'Payload de acta inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = candidate.expectedUpdatedAt;
    return enqueueSqliteIpc('actas:save-record-if-unchanged', () =>
      saveActaRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('actas:create-outlook-calendar', async (_event, payload: unknown) =>
    createOutlookCalendar(payload),
  );
}
