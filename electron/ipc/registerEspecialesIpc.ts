/**
 * Módulo Especiales: destinatarios, creación de borrador de Outlook y parseo de .msg.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { createOutlookDraft } from '../outlookIntegration.js';
import { normalizeOutlookMsgPayload, parseOutlookMsgBuffer } from '../msgParser.js';
import { getSqliteStatus, loadEspecialesRecipientRecordsSnapshot, saveEspecialesRecipientRecordIfUnchanged } from '../sqlitePersistence.js';

export function registerEspecialesIpc(): void {
  ipcMain.handle('especiales:load-recipient-records', () =>
    enqueueSqliteIpc('especiales:load-recipient-records', () => loadEspecialesRecipientRecordsSnapshot()),
  );
  ipcMain.handle('especiales:save-recipient-record-if-unchanged', (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return {
        ok: false,
        status: getSqliteStatus(),
        currentUpdatedAt: null,
        message: 'Payload de destinatario inválido.',
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
        message: 'Payload de destinatario inválido.',
      };
    }

    return enqueueSqliteIpc('especiales:save-recipient-record-if-unchanged', () =>
      saveEspecialesRecipientRecordIfUnchanged({
        id: candidate.id as string,
        value: candidate.value as string,
        expectedUpdatedAt: typeof candidate.expectedUpdatedAt === 'string' ? candidate.expectedUpdatedAt : null,
      }),
    );
  });
  ipcMain.handle('especiales:create-outlook-draft', async (_event, payload: unknown) =>
    createOutlookDraft(payload),
  );
  ipcMain.handle('msg:parseOutlookMsg', async (_event, payload: unknown) => {
    try {
      const buffer = normalizeOutlookMsgPayload(payload);
      if (!buffer?.length) {
        return { ok: false, message: 'Contenido .msg no válido.' };
      }

      return parseOutlookMsgBuffer(buffer);
    } catch (error) {
      console.error('Error parseando .msg:', error);
      return { ok: false, message: 'No se ha podido importar el mensaje .msg.' };
    }
  });
}
