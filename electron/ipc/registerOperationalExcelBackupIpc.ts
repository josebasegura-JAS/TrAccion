import { BrowserWindow, dialog, ipcMain } from 'electron';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export function registerOperationalExcelBackupIpc(): void {
  ipcMain.handle('operational-backup:select-directory', async (event) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    const options = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
    const result = browserWindow
      ? await dialog.showOpenDialog(browserWindow, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('operational-backup:save-excel', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'Datos inválidos para guardar el Excel automático.', path: null };
    }
    const candidate = payload as {
      directory?: unknown;
      fileName?: unknown;
      cleanupPrefix?: unknown;
      buffer?: unknown;
    };
    if (
      typeof candidate.directory !== 'string' ||
      typeof candidate.fileName !== 'string' ||
      typeof candidate.cleanupPrefix !== 'string' ||
      !(candidate.buffer instanceof ArrayBuffer)
    ) {
      return { ok: false, message: 'Datos inválidos para guardar el Excel automático.', path: null };
    }
    try {
      const directory = candidate.directory.trim();
      if (!directory) return { ok: false, message: 'No hay carpeta configurada para el Excel automático.', path: null };
      await mkdir(directory, { recursive: true });
      const safeFileName = path.basename(candidate.fileName);
      const safePrefix = path.basename(candidate.cleanupPrefix);
      const filePath = path.join(directory, safeFileName);

      // Debe existir un único espejo por módulo. Si cambia el día, el nombre cambia
      // y se elimina el fichero anterior antes de escribir el nuevo. En el mismo día
      // se conserva el mismo nombre y writeFile lo sobrescribe.
      const existingFiles = await readdir(directory);
      const previousBackups = existingFiles.filter(
        (name) =>
          name !== safeFileName &&
          name.startsWith(safePrefix) &&
          name.toLowerCase().endsWith('.xlsx'),
      );
      for (const previousFile of previousBackups) {
        await unlink(path.join(directory, previousFile));
      }

      await writeFile(filePath, Buffer.from(candidate.buffer));
      return { ok: true, message: `Excel automático actualizado en ${filePath}.`, path: filePath };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático: ${detail}`, path: null };
    }
  });
}
