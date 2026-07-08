/**
 * Módulo Sorteos.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { getSqliteStatus, loadSorteosRecordsSnapshot, saveSorteosSnapshotIfUnchanged } from '../sqlitePersistence.js';

export function registerSorteosIpc(): void {
  ipcMain.handle('sorteos:load-records', () => enqueueSqliteIpc('sorteos:load-records', () => loadSorteosRecordsSnapshot()));
  ipcMain.handle('sorteos:save-snapshot-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentDrawsUpdatedAt: null,
        currentExclusionsUpdatedAt: null,
        message: 'Payload de sorteos inválido.',
      };
    }

    const candidate = payload as {
      draws?: unknown;
      exclusions?: unknown;
      expectedDrawsUpdatedAt?: unknown;
      expectedExclusionsUpdatedAt?: unknown;
    };

    const isRecordArray = (value: unknown): value is Array<{ id: string; value: string }> =>
      Array.isArray(value) &&
      value.every((item) => {
        if (!item || typeof item !== 'object') {
          return false;
        }
        const record = item as { id?: unknown; value?: unknown };
        return typeof record.id === 'string' && typeof record.value === 'string';
      });

    if (
      !isRecordArray(candidate.draws) ||
      !isRecordArray(candidate.exclusions) ||
      (typeof candidate.expectedDrawsUpdatedAt !== 'string' && candidate.expectedDrawsUpdatedAt !== null) ||
      (typeof candidate.expectedExclusionsUpdatedAt !== 'string' && candidate.expectedExclusionsUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentDrawsUpdatedAt: null,
        currentExclusionsUpdatedAt: null,
        message: 'Payload de sorteos inválido.',
      };
    }

    const draws = candidate.draws;
    const exclusions = candidate.exclusions;
    const expectedDrawsUpdatedAt = candidate.expectedDrawsUpdatedAt;
    const expectedExclusionsUpdatedAt = candidate.expectedExclusionsUpdatedAt;
    return enqueueSqliteIpc('sorteos:save-snapshot-if-unchanged', () =>
      saveSorteosSnapshotIfUnchanged({
        draws,
        exclusions,
        expectedDrawsUpdatedAt,
        expectedExclusionsUpdatedAt,
      }),
    );
  });
}
