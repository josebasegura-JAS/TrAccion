import { BrowserWindow, dialog, ipcMain } from 'electron';
import { copyFile, mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
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
      const tempPath = path.join(
        directory,
        `.${safePrefix}.${process.pid}.${Date.now()}.tmp.xlsx`,
      );

      // Escritura segura: primero se genera un temporal. Solo si puede copiarse al
      // destino definitivo se eliminan los espejos antiguos. Si Excel mantiene el
      // fichero abierto, copyFile falla y se conserva intacta la última copia válida.
      await writeFile(tempPath, Buffer.from(candidate.buffer));
      try {
        await copyFile(tempPath, filePath);
      } finally {
        await unlink(tempPath).catch(() => undefined);
      }

      const existingFiles = await readdir(directory);
      const previousBackups = existingFiles.filter(
        (name) =>
          name !== safeFileName &&
          name.startsWith(safePrefix) &&
          name.toLowerCase().endsWith('.xlsx'),
      );
      for (const previousFile of previousBackups) {
        await unlink(path.join(directory, previousFile)).catch(() => undefined);
      }

      return { ok: true, message: `Excel automático actualizado en ${filePath}.`, path: filePath };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code ?? '')
        : '';
      const locked = ['EBUSY', 'EPERM', 'EACCES'].includes(code);
      return {
        ok: false,
        message: locked
          ? `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático porque el archivo está abierto o bloqueado. Cierra el Excel y vuelve a guardar. Detalle: ${detail}`
          : `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático: ${detail}`,
        path: null,
      };
    }
  });
}
