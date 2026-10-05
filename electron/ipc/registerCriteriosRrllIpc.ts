/**
 * Criterios RRLL y tipos de Acta.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { validateConditionalJsonRecord, validateConditionalJsonRecordBatch } from './ipcHelpers.js';
import {
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
    const record = validateConditionalJsonRecord(payload, 'Payload de criterio RRLL inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('criterios-rrll:save-record-if-unchanged', () =>
      saveCriteriosRrllRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('criterios-rrll:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(payload, 'Payload de lote de criterios RRLL inválido.');
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('criterios-rrll:save-records-if-unchanged', () =>
      saveCriteriosRrllRecordsIfUnchanged(batch.records),
    );
  });
  ipcMain.handle('acta-types:load-records', () =>
    enqueueSqliteIpc('acta-types:load-records', () => loadActaTypeRecordsSnapshot()),
  );
  ipcMain.handle('acta-types:save-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de tipo de acta inválido.');
    if (!record.ok) return record.result;

    return enqueueSqliteIpc('acta-types:save-record-if-unchanged', () =>
      saveActaTypeRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('acta-types:save-records-if-unchanged', (_event, payload: unknown) => {
    const batch = validateConditionalJsonRecordBatch(payload, 'Payload de lote de tipos de acta inválido.');
    if (!batch.ok) return batch.result;

    return enqueueSqliteIpc('acta-types:save-records-if-unchanged', () =>
      saveActaTypeRecordsIfUnchanged(batch.records),
    );
  });
}
