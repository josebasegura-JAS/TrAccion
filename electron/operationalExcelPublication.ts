import { getTraccionEnvironment } from './persistence/traccionEnvironment.js';
import { captureTestPublication } from './persistence/testOutputPaths.js';
import { randomUUID } from 'node:crypto';
import { readdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Reject path components, Windows ADS/device names and ambiguous filenames. */
export function assertExcelFileName(fileName: string): void {
  if (!fileName || fileName.startsWith('.') || fileName !== fileName.trim() ||
      /[<>:"/\\|?*]/.test(fileName) ||
      Array.from(fileName).some(character => character.charCodeAt(0) < 32) ||
      /^(?:CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(fileName) ||
      !fileName.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Nombre de archivo Excel no válido.');
  }
}

/** Publish without truncating the previous destination on write failure. */
async function publishExcelAtomically(directory: string, fileName: string, data: Uint8Array, check?: () => Promise<void>): Promise<string> {
  assertExcelFileName(fileName);
  if (!data.byteLength) throw new Error('Contenido Excel vacío.');
  const destination = path.join(directory, fileName);
  const temp = path.join(directory, '.traccion-excel-' + randomUUID() + '.tmp');
  try {
    await check?.();
    await writeFile(temp, data, { flag: 'wx' });
    await check?.();
    await rename(temp, destination);
  } finally {
    try { await check?.(); await rm(temp, { force: true }); } catch { /* No limpiar un destino que ya no está autorizado. */ }
  }
  return destination;
}

/** Lotería automatic mirror is deliberately unavailable in PRUEBAS. */
export async function publishLotteryExcel(directory: string, fileName: string, data: Uint8Array): Promise<string> {
  if (getTraccionEnvironment() === 'test') throw new Error('Excel automático desactivado en PRUEBAS.');
  return publishExcelAtomically(directory, fileName, data);
}

/**
 * Se podan exclusivamente los históricos con fecha generados por TrAcción:
 *   Licencias_y_Excedencias_DD-MM-YYYY.xlsx
 *   Vinculograma_DD-MM-YYYY.xlsx
 *
 * Un prefijo genérico NO autoriza a borrar cualquier Excel que empiece igual.
 * Los demás respaldos (Coordinación, Ticket Restaurante, etc.) conservan
 * el nombre fijo y nunca generan limpieza de ficheros por aproximación.
 */
export function selectObsoleteOperationalExcelBackups(
  existingFiles: readonly string[],
  currentFileName: string,
  cleanupPrefix: string,
): string[] {
  const allowedPrefix = cleanupPrefix === 'Licencias_y_Excedencias_'
    || cleanupPrefix === 'Vinculograma_';
  if (!allowedPrefix) return [];

  return selectDatedExcelHistory(existingFiles, currentFileName, cleanupPrefix);
}

/** A valid calendar date in a generated workbook name. */
function datedExcelValue(name: string, prefix: string): number | null {
  if (!name.toLowerCase().startsWith(prefix.toLowerCase())) return null;
  const match = /^(\d{2})-(\d{2})-(\d{4})\.xlsx$/i.exec(name.slice(prefix.length));
  if (!match) return null;
  const [, d, m, y] = match;
  const day = Number(d), month = Number(m), year = Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 2000 && date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date.getTime() : null;
}

/** Only recognized, strictly older calendar dates; never prune a newer publication. */
export function selectDatedExcelHistory(
  existingFiles: readonly string[], currentFileName: string, prefix: string,
): string[] {
  const current = datedExcelValue(currentFileName, prefix);
  if (current === null) return [];
  return existingFiles.filter(name => {
    const date = datedExcelValue(name, prefix);
    return date !== null && date < current;
  });
}

export function selectLotteryExcelHistory(existingFiles: readonly string[], currentFileName: string, year: number): string[] {
  if (!Number.isInteger(year) || year < 2000 || year > 9999) return [];
  const prefix = 'Loteria_' + year + '_';
  if (datedExcelValue(currentFileName, prefix) === null) return [];
  return [...selectDatedExcelHistory(existingFiles, currentFileName, prefix),
    ...existingFiles.filter(name => name === 'Loteria_' + year + '.xlsx')];
}

/**
 * Publica en la misma carpeta mediante rename, sin copiar sobre el destino.
 * Si la escritura del temporal o el rename falla (incluido Excel abierto),
 * la versión publicada anteriormente no se toca.
 *
 * La limpieza de históricos nunca invalida una publicación ya correcta.
 */
export async function publishOperationalExcelBackup(
  directory: string,
  fileName: string,
  cleanupPrefix: string,
  data: Uint8Array,
): Promise<string> {
  let check: (() => Promise<void>) | undefined;
  if (getTraccionEnvironment() === 'test') {
    const { getSqliteStatus } = await import('./sqlitePersistenceFacade.js');
    check = await captureTestPublication(getSqliteStatus, directory, 'excel', 'operativos');
  }
  const destination = await publishExcelAtomically(directory, fileName, data, check);

  // Podar únicamente los ficheros exactamente reconocidos y solo después
  // de publicar correctamente. Ante fallo de enumeración no se toca nada más.
  try {
    await check?.();
    const entries = await readdir(directory);
    for (const obsoleteName of selectObsoleteOperationalExcelBackups(entries, fileName, cleanupPrefix)) {
      try {
        await check?.();
        await rm(path.join(directory, obsoleteName));
      } catch (error) {
        console.warn('No se ha podido podar un respaldo Excel antiguo; se conserva.', error);
      }
    }
  } catch (error) {
    console.warn('No se ha podido comprobar la limpieza de respaldos Excel; se conservan los anteriores.', error);
  }
  return destination;
}
