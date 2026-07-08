/**
 * Criterios RRLL y tipos de Acta.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import {
  getSqliteStatus,
  loadCriteriosRrllRecordsSnapshot,
  loadActaTypeRecordsSnapshot,
  saveCriteriosRrllRecordIfUnchanged,
  saveCriteriosRrllRecordsIfUnchanged,
  saveActaTypeRecordIfUnchanged,
  saveActaTypeRecordsIfUnchanged,
} from '../sqlitePersistence.js';

export function registerCriteriosRrllIpc(): void {
  ipcMain.handle('criterios-rrll:load-records', () =>
    enqueueSqliteIpc('criterios-rrll:load-records', () => loadCriteriosRrllRecordsSnapshot()),
  );
  ipcMain.handle('criterios-rrll:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de criterio RRLL inválido.',
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
        message: 'Payload de criterio RRLL inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('criterios-rrll:save-record-if-unchanged', () =>
      saveCriteriosRrllRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('criterios-rrll:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de criterios RRLL inválido.',
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

    return enqueueSqliteIpc('criterios-rrll:save-records-if-unchanged', () =>
      saveCriteriosRrllRecordsIfUnchanged(records),
    );
  });
  ipcMain.handle('acta-types:load-records', () =>
    enqueueSqliteIpc('acta-types:load-records', () => loadActaTypeRecordsSnapshot()),
  );
  ipcMain.handle('acta-types:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de tipo de acta inválido.',
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
        message: 'Payload de tipo de acta inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedUpdatedAt = typeof candidate.expectedUpdatedAt === 'string'
      ? candidate.expectedUpdatedAt
      : null;
    return enqueueSqliteIpc('acta-types:save-record-if-unchanged', () =>
      saveActaTypeRecordIfUnchanged({
        id,
        value,
        expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('acta-types:save-records-if-unchanged', (_event, payload: unknown) => {
    const invalidPayloadResult = {
      ok: false,
      status: getSqliteStatus(),
      results: [],
      message: 'Payload de lote de tipos de acta inválido.',
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

    return enqueueSqliteIpc('acta-types:save-records-if-unchanged', () =>
      saveActaTypeRecordsIfUnchanged(records),
    );
  });
}
