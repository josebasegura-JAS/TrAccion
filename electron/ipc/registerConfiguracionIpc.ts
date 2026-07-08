/**
 * Configuración general (orígenes de tareas, etc.).
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { getSqliteStatus, loadConfiguracionSnapshot, saveConfiguracionIfUnchanged } from '../sqlitePersistence.js';

export function registerConfiguracionIpc(): void {
  ipcMain.handle('configuracion:load', () =>
    enqueueSqliteIpc('configuracion:load', () => loadConfiguracionSnapshot()),
  );
  ipcMain.handle('configuracion:save-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de configuración inválido.',
      };
    }

    const candidate = payload as { value?: unknown; expectedUpdatedAt?: unknown };
    if (
      typeof candidate.value !== 'string' ||
      (typeof candidate.expectedUpdatedAt !== 'string' && candidate.expectedUpdatedAt !== null)
    ) {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de configuración inválido.',
      };
    }

    return enqueueSqliteIpc('configuracion:save-if-unchanged', () =>
      saveConfiguracionIfUnchanged({
        value: candidate.value as string,
        expectedUpdatedAt: typeof candidate.expectedUpdatedAt === 'string' ? candidate.expectedUpdatedAt : null,
      }),
    );
  });
}
