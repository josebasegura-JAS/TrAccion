/**
 * Utilidades genéricas de documentos usadas por varios módulos: abrir un Excel generado y extraer texto de un Word.
 * Extraído de main.ts como parte de la división de registerIpcHandlers()
 * en un fichero por área funcional.
 */
import { ipcMain } from 'electron';
import { openExcelWorkbook } from '../documentOpener.js';
import { extractTextFromDocxBuffer, normalizeDocxTextPayload } from '../docxZip.js';

export function registerSharedDocumentIpc(): void {
  ipcMain.handle('excel:open-workbook', async (_event, payload: unknown) =>
    openExcelWorkbook(payload),
  );
  ipcMain.handle('docx:extract-text', async (_event, payload: unknown) => {
    try {
      return { ok: true, text: extractTextFromDocxBuffer(normalizeDocxTextPayload(payload)) };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'No se ha podido leer el documento Word.',
      };
    }
  });
}
