/**
 * Comité, Paritaria y Actas (comparten el mismo patrón de sesión/registro), más la creación de citas de Outlook para Actas.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { createOutlookCalendar } from '../outlookIntegration.js';
import {
  getSqliteStatus,
  loadComiteSessionRecordsSnapshot,
  loadParitariaSessionRecordsSnapshot,
  loadActaRecordsSnapshot,
  saveComiteSessionRecordIfUnchanged,
  saveParitariaSessionRecordIfUnchanged,
  saveActaRecordIfUnchanged,
} from '../sqlitePersistence.js';

export function registerSesionesIpc(): void {
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
