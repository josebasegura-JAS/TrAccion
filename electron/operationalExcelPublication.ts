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

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapeRegExp(cleanupPrefix)}(\\d{2})-(\\d{2})-(\\d{4})\\.xlsx$`, 'i');
  if (!pattern.test(currentFileName)) return [];

  return existingFiles.filter((name) => {
    if (name === currentFileName) return false;
    const match = pattern.exec(name);
    if (!match) return false;
    const [, dayText, monthText, yearText] = match;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));
    return year >= 2000 && date.getUTCFullYear() === year
      && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  });
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
