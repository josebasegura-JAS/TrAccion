import { resolveTestOutputDirectory } from '../persistence/testOutputPaths.js';
import { getTraccionEnvironment } from '../persistence/traccionEnvironment.js';
import { BrowserWindow, dialog, ipcMain } from 'electron';
import { mkdir, readdir, unlink } from 'node:fs/promises';
import { assertExcelFileName, publishLotteryExcel, selectLotteryExcelHistory } from '../operationalExcelPublication.js';
import path from 'node:path';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { getSqliteStatus, loadLoteriaRecordsSnapshot, saveLoteriaSnapshotIfUnchanged } from '../sqlitePersistenceFacade.js';


function resolveCampaignDirectory(template: string, year: number): string {
  const normalized = template.trim().replace(/\{\{?year\}?\}/gi, String(year));
  if (!normalized) {
    throw new Error('No hay configurada una carpeta para el Excel de Lotería.');
  }
  return normalized;
}

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

  ipcMain.handle('loteria:select-export-directory', async (event) => {
    if (getTraccionEnvironment() === 'test') return resolveTestOutputDirectory(getSqliteStatus(), 'excel', 'loteria');
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('loteria:save-campaign-excel', async (_event, payload: unknown) => {
    if (getTraccionEnvironment() === 'test') return { ok: true, path: null, message: 'Excel automático desactivado en PRUEBAS.' };
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'Datos inválidos para guardar el Excel de Lotería.', path: null };
    }
    const candidate = payload as {
      year?: unknown;
      directoryTemplate?: unknown;
      fileName?: unknown;
      buffer?: unknown;
    };
    if (typeof candidate.year !== 'number' || typeof candidate.directoryTemplate !== 'string' || typeof candidate.fileName !== 'string' || !(candidate.buffer instanceof ArrayBuffer)) {
      return { ok: false, message: 'Datos inválidos para guardar el Excel de Lotería.', path: null };
    }
    try {
      assertExcelFileName(candidate.fileName);
      if (candidate.buffer.byteLength === 0) throw new Error('Contenido Excel vacío.');
      const directory = resolveCampaignDirectory(candidate.directoryTemplate, candidate.year);
      await mkdir(directory, { recursive: true });
      const safeFileName = candidate.fileName;
      const filePath = await publishLotteryExcel(directory, safeFileName, Buffer.from(candidate.buffer));

      // Lotería mantiene un único Excel espejo por campaña. El nombre refleja la
      // fecha de la última actualización; al cambiar de día se elimina el anterior.
      try {
        const existingFiles = await readdir(directory);
        for (const obsoleteFile of selectLotteryExcelHistory(existingFiles, safeFileName, candidate.year)) {
          await unlink(path.join(directory, obsoleteFile)).catch(() => undefined);
        }
      } catch (error) {
        console.warn('No se ha podido limpiar el histórico de Lotería.', error);
      }

      return { ok: true, message: `Excel actualizado en ${filePath}.`, path: filePath };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      const locked = ['EBUSY', 'EPERM', 'EACCES'].includes(code);
      return {
        ok: false,
        message: locked
          ? `Datos guardados en TrAcción, pero no se ha podido actualizar el Excel automático porque el archivo está abierto o bloqueado. Cierra el Excel y vuelve a guardar. Detalle: ${detail}`
          : `Datos guardados en TrAcción, pero no se ha podido actualizar el Excel automático: ${detail}`,
        path: null,
      };
    }
  });

}
