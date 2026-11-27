import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { captureTestPublication, resolveTestOutputDirectory } from './persistence/testOutputPaths.js';
import { getSqliteStatus } from './sqlitePersistenceFacade.js';
import { shell } from 'electron';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

function normalizePayload(payload: unknown, extension: 'docx' | 'xlsx'): { buffer: Buffer; fileName: string } {
  if (!payload || typeof payload !== 'object') throw new Error('Documento no válido.');
  const candidate = payload as { buffer?: unknown; fileName?: unknown };
  if (typeof candidate.fileName !== 'string' || !candidate.fileName.trim()) {
    throw new Error('Nombre del documento no válido.');
  }
  let fileName = path.basename(candidate.fileName)
    .replace(/[<>:"/\\|?*]/g, '_')
    .split('')
    .map(character => character.charCodeAt(0) < 32 ? '_' : character)
    .join('').trim();
  if (!fileName || fileName === '.' || fileName === '..' ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(fileName)) {
    throw new Error('Nombre del documento no válido.');
  }
  if (!fileName.toLowerCase().endsWith('.' + extension)) fileName += '.' + extension;
  const raw = candidate.buffer;
  const buffer = raw instanceof ArrayBuffer ? Buffer.from(raw)
    : ArrayBuffer.isView(raw) ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength) : null;
  if (!buffer?.byteLength) throw new Error('Contenido del documento vacío o no válido.');
  return { buffer, fileName };
}

/** Never prune successfully opened documents: Office may still be editing them.
 * Clean only our own failed attempt, never recursively remove a directory.
 */
async function openReviewDocument(payload: unknown, extension: 'docx' | 'xlsx'): Promise<{ ok: boolean; message: string }> {
  let directory: string | undefined;
  let filePath: string | undefined;
  let check: (() => Promise<void>) | undefined;
  let handedOff = false;
  try {
    const { buffer, fileName } = normalizePayload(payload, extension);
    const testing = getTraccionEnvironment() === 'test';
    const category = extension === 'docx' ? 'word' : 'excel';
    const root = testing ? await resolveTestOutputDirectory(getSqliteStatus(), category, 'manuales') : tmpdir();
    if (testing) check = await captureTestPublication(getSqliteStatus, root, category, 'manuales');
    await check?.();
    directory = await mkdtemp(path.join(root, extension === 'docx' ? 'traccion-teletrabajo-' : 'traccion-excel-'));
    filePath = path.join(directory, fileName);
    await check?.();
    await writeFile(filePath, buffer, { flag: 'wx' });
    await check?.();
    // Once handed to the OS, even an exception can leave the result uncertain.
    handedOff = true;
    const openError = await shell.openPath(filePath);
    if (openError) {
      handedOff = false;
      return { ok: false, message: openError };
    }
    return { ok: true, message: (extension === 'docx' ? 'Word' : 'Excel') + ' abierto para revisión en ' + filePath };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido abrir el documento generado.' };
  } finally {
    if (!handedOff && directory) {
      try {
        await check?.();
        if (filePath) await unlink(filePath).catch(() => undefined);
        await check?.();
        await rmdir(directory).catch(() => undefined);
      } catch { /* Preserve files if the destination is no longer authorized. */ }
    }
  }
}

export function openTeletrabajoWord(payload: unknown): Promise<{ ok: boolean; message: string }> {
  return openReviewDocument(payload, 'docx');
}

export function openExcelWorkbook(payload: unknown): Promise<{ ok: boolean; message: string }> {
  return openReviewDocument(payload, 'xlsx');
}
