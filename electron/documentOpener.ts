import { shell } from 'electron';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Escribe un buffer (Word o Excel generado en el renderer) a un archivo
 * temporal y lo abre con la aplicación asociada del sistema. Extraído de
 * main.ts: no depende del ciclo de vida de la app, solo de shell.openPath.
 */
function normalizeDocxOutputPayload(payload: unknown): { buffer: Buffer; fileName: string } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Documento Word no válido.');
  }

  const candidate = payload as { buffer?: unknown; fileName?: unknown };
  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Nombre del documento Word no válido.');
  }

  const fileName = path
    .basename(candidate.fileName)
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const rawBuffer = candidate.buffer;
  if (rawBuffer instanceof ArrayBuffer) {
    return { buffer: Buffer.from(rawBuffer), fileName };
  }

  if (ArrayBuffer.isView(rawBuffer)) {
    return {
      buffer: Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength),
      fileName,
    };
  }

  throw new Error('Contenido del documento Word no válido.');
}

export async function openTeletrabajoWord(payload: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const { buffer, fileName } = normalizeDocxOutputPayload(payload);
    const directory = await mkdtemp(path.join(tmpdir(), 'traccion-teletrabajo-'));
    const filePath = path.join(
      directory,
      fileName.toLowerCase().endsWith('.docx') ? fileName : `${fileName}.docx`,
    );
    await writeFile(filePath, buffer);
    const openError = await shell.openPath(filePath);

    if (openError) {
      return { ok: false, message: openError };
    }

    return { ok: true, message: 'Word abierto para revisión.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido abrir el Word generado.',
    };
  }
}

function normalizeExcelWorkbookPayload(payload: unknown): { buffer: Buffer; fileName: string } {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Libro Excel no válido.');
  }

  const candidate = payload as { buffer?: unknown; fileName?: unknown };
  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Nombre del Excel no válido.');
  }

  const fileName = path
    .basename(candidate.fileName)
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
    .join('');
  const rawBuffer = candidate.buffer;
  if (rawBuffer instanceof ArrayBuffer) {
    return { buffer: Buffer.from(rawBuffer), fileName };
  }

  if (ArrayBuffer.isView(rawBuffer)) {
    return {
      buffer: Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength),
      fileName,
    };
  }

  throw new Error('Contenido del Excel no válido.');
}

export async function openExcelWorkbook(payload: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const { buffer, fileName } = normalizeExcelWorkbookPayload(payload);
    const directory = await mkdtemp(path.join(tmpdir(), 'traccion-excel-'));
    const filePath = path.join(
      directory,
      fileName.toLowerCase().endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    );
    await writeFile(filePath, buffer);
    const openError = await shell.openPath(filePath);

    if (openError) {
      return { ok: false, message: openError };
    }

    return { ok: true, message: 'Excel abierto para revisión.' };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido abrir el Excel generado.',
    };
  }
}
