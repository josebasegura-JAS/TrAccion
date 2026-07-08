/**
 * Módulo Presupuestos.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { getSqliteStatus, loadPresupuestosRecordsSnapshot, savePresupuestosSnapshotIfUnchanged } from '../sqlitePersistence.js';

export function registerPresupuestosIpc(): void {
  ipcMain.handle('presupuestos:load-records', () =>
    enqueueSqliteIpc('presupuestos:load-records', () => loadPresupuestosRecordsSnapshot()),
  );
  ipcMain.handle('presupuestos:save-snapshot-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de presupuestos inválido.',
      };
    }

    const candidate = payload as {
      scenarios?: unknown;
      manualItems?: unknown;
      ticketGroups?: unknown;
      actuals?: unknown;
      expectedUpdatedAt?: unknown;
    };

    const isRecordArray = (value: unknown): value is Array<{ id: string; value: string }> =>
      Array.isArray(value) &&
      value.every(
        (record) =>
          record &&
          typeof record === 'object' &&
          typeof (record as { id?: unknown }).id === 'string' &&
          typeof (record as { value?: unknown }).value === 'string',
      );

    if (
      !isRecordArray(candidate.scenarios) ||
      !isRecordArray(candidate.manualItems) ||
      !isRecordArray(candidate.ticketGroups) ||
      !isRecordArray(candidate.actuals) ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de presupuestos inválido.',
      };
    }

    const scenarios = candidate.scenarios as Array<{ id: string; value: string }>;
    const manualItems = candidate.manualItems as Array<{ id: string; value: string }>;
    const ticketGroups = candidate.ticketGroups as Array<{ id: string; value: string }>;
    const actuals = candidate.actuals as Array<{ id: string; value: string }>;

    return enqueueSqliteIpc('presupuestos:save-snapshot-if-unchanged', () =>
      savePresupuestosSnapshotIfUnchanged({
        scenarios,
        manualItems,
        ticketGroups,
        actuals,
        expectedUpdatedAt:
          typeof candidate.expectedUpdatedAt === 'string' ? candidate.expectedUpdatedAt : null,
      }),
    );
  });
}
