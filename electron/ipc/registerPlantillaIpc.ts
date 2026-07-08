/**
 * Módulo Plantilla (empleados) y traducciones de puestos.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { validateJsonRecordPayload } from './ipcHelpers.js';
import {
  getSqliteStatus,
  loadEmployeeRecordsSnapshot,
  loadJobPositionTranslationRecordsSnapshot,
  saveEmployeeRecordIfUnchanged,
  saveEmployeeRecordsIfUnchanged,
  saveJobPositionTranslationRecordIfUnchanged,
} from '../sqlitePersistence.js';

export function registerPlantillaIpc(): void {
  ipcMain.handle('plantilla:load-records', () =>
    enqueueSqliteIpc('plantilla:load-records', () => loadEmployeeRecordsSnapshot()),
  );
  ipcMain.handle('plantilla:save-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentValue: null,
        message: 'Payload de plantilla inválido.',
      };
    }

    const candidate = payload as { id?: unknown; value?: unknown; expectedValue?: unknown };
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedValue !== 'string' && candidate.expectedValue !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentValue: null,
        message: 'Payload de plantilla inválido.',
      };
    }

    const id = candidate.id;
    const value = candidate.value;
    const expectedValue = candidate.expectedValue;
    return enqueueSqliteIpc('plantilla:save-record-if-unchanged', () =>
      saveEmployeeRecordIfUnchanged({
        id,
        value,
        expectedValue,
      }),
    );
  });
  ipcMain.handle('plantilla:save-records-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { records?: unknown }).records)) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentValue: null,
        message: 'Payload de importación de plantilla inválido.',
        saved: 0,
      };
    }

    const records = (payload as { records: unknown[] }).records;
    const normalizedRecords = [] as Array<{ id: string; value: string; expectedValue: string | null }>;

    for (const record of records) {
      if (!record || typeof record !== 'object') {
        return {
          ok: false,
          status: getSqliteStatus(),
          currentValue: null,
          message: 'Payload de importación de plantilla inválido.',
          saved: 0,
        };
      }

      const candidate = record as { id?: unknown; value?: unknown; expectedValue?: unknown };
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.value !== 'string' ||
        (typeof candidate.expectedValue !== 'string' && candidate.expectedValue !== null)
      ) {
        return {
          ok: false,
          status: getSqliteStatus(),
          currentValue: null,
          message: 'Payload de importación de plantilla inválido.',
          saved: 0,
        };
      }

      normalizedRecords.push({
        id: candidate.id,
        value: candidate.value,
        expectedValue: candidate.expectedValue,
      });
    }

    return enqueueSqliteIpc('plantilla:save-records-if-unchanged', () =>
      saveEmployeeRecordsIfUnchanged(normalizedRecords),
    );
  });
  ipcMain.handle('plantilla-job-translations:load-records', () =>
    enqueueSqliteIpc('plantilla-job-translations:load-records', () => loadJobPositionTranslationRecordsSnapshot()),
  );
  ipcMain.handle('plantilla-job-translations:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateJsonRecordPayload(payload, 'Payload de traducción de puesto inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('plantilla-job-translations:save-record-if-unchanged', () =>
      saveJobPositionTranslationRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
}
