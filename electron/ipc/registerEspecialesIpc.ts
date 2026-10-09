/**
 * Módulo Especiales: destinatarios, creación de borrador de Outlook y parseo de .msg.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { enqueueSqliteIpc } from '../sqliteIpcQueue.js';
import { createOutlookDraftCompat } from '../outlookDraftCompat.js';
import { normalizeOutlookMsgPayload, parseOutlookMsgBuffer } from '../msgParser.js';
import { validateConditionalJsonRecord } from './ipcHelpers.js';
import { loadEspecialesRecipientRecordsSnapshot, saveEspecialesRecipientRecordIfUnchanged } from '../sqlitePersistence.js';

export function registerEspecialesIpc(): void {
  ipcMain.handle('especiales:load-recipient-records', () =>
    enqueueSqliteIpc('especiales:load-recipient-records', () => loadEspecialesRecipientRecordsSnapshot()),
  );
  ipcMain.handle('especiales:save-recipient-record-if-unchanged', (_event, payload: unknown) => {
    const record = validateConditionalJsonRecord(payload, 'Payload de destinatario inválido.');
    if (!record.ok) {
      return record.result;
    }

    return enqueueSqliteIpc('especiales:save-recipient-record-if-unchanged', () =>
      saveEspecialesRecipientRecordIfUnchanged({
        id: record.id,
        value: record.value,
        expectedUpdatedAt: record.expectedUpdatedAt,
      }),
    );
  });
  ipcMain.handle('especiales:create-outlook-draft', async (_event, payload: unknown) =>
    createOutlookDraftCompat(payload),
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
