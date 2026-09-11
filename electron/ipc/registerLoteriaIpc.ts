import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { getSqliteStatus, loadLoteriaRecordsSnapshot, saveLoteriaSnapshotIfUnchanged } from '../sqlitePersistence.js';

export function registerLoteriaIpc(): void {
  ipcMain.handle('loteria:load-records', () =>
    enqueueSqliteIpc('loteria:load-records', () => loadLoteriaRecordsSnapshot()),
  );

  ipcMain.handle('loteria:save-snapshot-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, status: getSqliteStatus(), campaignUpdatedAt: null, requestUpdatedAt: {}, message: 'Payload de Lotería inválido.' };
    }
    const candidate = payload as {
      year?: unknown;
      campaignValue?: unknown;
      requests?: unknown;
      expectedCampaignUpdatedAt?: unknown;
      expectedRequestUpdatedAt?: unknown;
    };
    if (
      typeof candidate.year !== 'number' ||
      typeof candidate.campaignValue !== 'string' ||
      !Array.isArray(candidate.requests) ||
      (typeof candidate.expectedCampaignUpdatedAt !== 'string' && candidate.expectedCampaignUpdatedAt !== null) ||
      !candidate.expectedRequestUpdatedAt || typeof candidate.expectedRequestUpdatedAt !== 'object'
    ) {
      return { ok: false, status: getSqliteStatus(), campaignUpdatedAt: null, requestUpdatedAt: {}, message: 'Payload de Lotería inválido.' };
    }
    const requests = candidate.requests as Array<{ id?: unknown; value?: unknown }>;
    if (requests.some((request) => typeof request?.id !== 'string' || typeof request?.value !== 'string')) {
      return { ok: false, status: getSqliteStatus(), campaignUpdatedAt: null, requestUpdatedAt: {}, message: 'Solicitudes de Lotería inválidas.' };
    }
    return enqueueSqliteIpc('loteria:save-snapshot-if-unchanged', () =>
      saveLoteriaSnapshotIfUnchanged({
        year: candidate.year as number,
        campaignValue: candidate.campaignValue as string,
        requests: requests as Array<{ id: string; value: string }>,
        expectedCampaignUpdatedAt: candidate.expectedCampaignUpdatedAt as string | null,
        expectedRequestUpdatedAt: candidate.expectedRequestUpdatedAt as Record<string, string | null>,
      }),
    );
  });
}
