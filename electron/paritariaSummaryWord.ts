import { open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export interface ParitariaSummaryUpdatePayload {
  folderPath: string;
  code: string;
  date: string;
  points: string[];
}

export interface ParitariaSummaryUpdateResult {
  ok: boolean;
  message: string;
  filePath?: string;
  alreadyPresent?: boolean;
}

const SUMMARY_FILE_PATTERN = /^Resumen TEMÁTICA Comisión paritaria \((?!~\$).+\)\.docx$/i;
const LOCK_FILE_NAME = '.traccion-paritaria-summary.lock';
const LOCK_STALE_MS = 10 * 60 * 1000;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function textFromXml(xml: string): string {
  return decodeXml(
    [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
      .map((match) => match[1])
      .join(''),
  ).trim();
}

function replaceElementText(xml: string, value: string): string {
  let replaced = false;
  const escaped = escapeXml(value);
  return xml.replace(/<w:t\b([^>]*)>[\s\S]*?<\/w:t>/g, (_match, attrs: string) => {
    if (replaced) return `<w:t${attrs}></w:t>`;
    replaced = true;
    return `<w:t${attrs}>${escaped}</w:t>`;
  });
}

type XmlElementSlice = { xml: string; start: number; end: number };

function extractElements(xml: string, tag: string): XmlElementSlice[] {
  const tokenPattern = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
  const result: XmlElementSlice[] = [];
  let depth = 0;
  let start = -1;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(xml))) {
    const isClosing = match[0].startsWith('</');
    if (!isClosing) {
      if (depth === 0) start = match.index;
      depth += 1;
      continue;
    }
    depth -= 1;
    if (depth === 0 && start >= 0) {
      const end = tokenPattern.lastIndex;
      result.push({ xml: xml.slice(start, end), start, end });
      start = -1;
    }
  }
  return result;
}

function replaceTopLevelElements(
  xml: string,
  tag: string,
  replacer: (elementXml: string, index: number) => string,
): string {
  const elements = extractElements(xml, tag);
  if (!elements.length) return xml;
  let cursor = 0;
  let output = '';
  elements.forEach((element, index) => {
    output += xml.slice(cursor, element.start);
    output += replacer(element.xml, index);
    cursor = element.end;
  });
  return output + xml.slice(cursor);
}

function replaceRowCells(rowXml: string, values: string[]): string {
  return replaceTopLevelElements(rowXml, 'w:tc', (cellXml, index) =>
    replaceElementText(cellXml, values[index] ?? ''),
  );
}

function replaceDetailPoints(rowXml: string, points: string[]): string {
  return replaceTopLevelElements(rowXml, 'w:tc', (cellXml, cellIndex) => {
    // En el resumen de Paritaria los puntos están en la segunda celda.
    if (cellIndex !== 1) return replaceElementText(cellXml, '');

    const paragraphs = extractElements(cellXml, 'w:p').map((element) => element.xml);
    const paragraphTemplate = paragraphs.find((paragraph) => textFromXml(paragraph)) ?? paragraphs[0];
    if (!paragraphTemplate) return cellXml;

    const replacement = points.length
      ? points.map((point) => replaceElementText(paragraphTemplate, point)).join('')
      : replaceElementText(paragraphTemplate, '');

    const paragraphElements = extractElements(cellXml, 'w:p');
    const firstParagraph = paragraphElements[0];
    const lastParagraph = paragraphElements.at(-1);
    if (!firstParagraph || !lastParagraph) return cellXml;
    return `${cellXml.slice(0, firstParagraph.start)}${replacement}${cellXml.slice(lastParagraph.end)}`;
  });
}

function tableRows(tableXml: string): string[] {
  return extractElements(tableXml, 'w:tr').map((element) => element.xml);
}

function replaceTableRows(tableXml: string, rows: string[]): string {
  const rowElements = extractElements(tableXml, 'w:tr');
  const firstRow = rowElements[0];
  const lastRow = rowElements.at(-1);
  if (!firstRow || !lastRow) throw new Error('No se ha podido identificar la tabla histórica del documento.');
  return `${tableXml.slice(0, firstRow.start)}${rows.join('')}${tableXml.slice(lastRow.end)}`;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatSessionDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function normalizedDocumentText(xml: string): string {
  return compactText(textFromXml(xml));
}

function findReferenceRows(rows: string[], startIndex: number): { header: string; detail: string } {
  for (let index = startIndex; index >= 0; index -= 1) {
    const rowText = compactText(textFromXml(rows[index]));
    if (!/Orden del d[ií]a/i.test(rowText)) continue;
    const detail = rows[index + 1];
    if (detail) return { header: rows[index], detail };
  }
  throw new Error('No se ha encontrado una reunión de referencia para conservar el formato Word.');
}

function isBlankRow(rowXml: string): boolean {
  return compactText(textFromXml(rowXml)) === '';
}

export function updateParitariaSummaryDocumentXml(
  documentXml: string,
  payload: Pick<ParitariaSummaryUpdatePayload, 'code' | 'date' | 'points'>,
): { xml: string; alreadyPresent: boolean } {
  const code = compactText(payload.code);
  const points = payload.points.map(compactText).filter(Boolean);
  if (!code) throw new Error('La sesión no tiene código. No se puede actualizar el resumen histórico.');
  if (!payload.date) throw new Error('La sesión no tiene fecha. No se puede actualizar el resumen histórico.');
  if (normalizedDocumentText(documentXml).includes(code)) return { xml: documentXml, alreadyPresent: true };

  const year = payload.date.slice(0, 4);
  const tables = extractElements(documentXml, 'w:tbl');
  let targetTable = tables.find((element) => tableRows(element.xml).some((row) => compactText(textFromXml(row)) === year));

  // Para un año nuevo utilizamos la última tabla histórica: el documento de
  // Paritaria crece cronológicamente y los años más recientes están al final.
  if (!targetTable) {
    targetTable = [...tables].reverse().find((element) =>
      tableRows(element.xml).some((row) => /^20\d{2}$/.test(compactText(textFromXml(row)))),
    );
  }
  if (!targetTable) throw new Error('No se ha encontrado la tabla histórica del resumen de Paritaria.');

  const tableXml = targetTable.xml;
  const rows = tableRows(tableXml);
  let yearRowIndex = rows.findIndex((row) => compactText(textFromXml(row)) === year);
  let insertionIndex: number;

  if (yearRowIndex >= 0) {
    insertionIndex = yearRowIndex + 1;
    while (insertionIndex < rows.length) {
      const text = compactText(textFromXml(rows[insertionIndex]));
      if (/^20\d{2}$/.test(text)) break;
      if (isBlankRow(rows[insertionIndex])) break;
      insertionIndex += 1;
    }
  } else {
    // Insertamos antes de las filas vacías finales si existen.
    insertionIndex = rows.length;
    while (insertionIndex > 0 && isBlankRow(rows[insertionIndex - 1])) insertionIndex -= 1;

    const yearTemplate = [...rows].reverse().find((row) => /^20\d{2}$/.test(compactText(textFromXml(row))));
    if (!yearTemplate) throw new Error('No se ha encontrado una fila de año de referencia en el Word.');
    const newYearRow = replaceElementText(yearTemplate, year);
    rows.splice(insertionIndex, 0, newYearRow);
    yearRowIndex = insertionIndex;
    insertionIndex = yearRowIndex + 1;
  }

  const reference = findReferenceRows(rows, Math.min(insertionIndex - 1, rows.length - 1));
  const headerRow = replaceRowCells(reference.header, [code, formatSessionDate(payload.date), 'Orden del día.', 'Varios.']);
  const detailRow = replaceDetailPoints(reference.detail, points);
  rows.splice(insertionIndex, 0, headerRow, detailRow);

  const updatedTable = replaceTableRows(tableXml, rows);
  return {
    xml: `${documentXml.slice(0, targetTable.start)}${updatedTable}${documentXml.slice(targetTable.end)}`,
    alreadyPresent: false,
  };
}

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatUpdatedFileDate(date: Date): string {
  return `${date.getDate()} ${MONTHS_ES[date.getMonth()]} ${date.getFullYear()}`;
}

async function acquireLock(folderPath: string): Promise<() => Promise<void>> {
  const lockPath = path.join(folderPath, LOCK_FILE_NAME);
  try {
    const handle = await open(lockPath, 'wx');
    await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }), 'utf8');
    await handle.close();
  } catch {
    try {
      const info = await stat(lockPath);
      if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
        await unlink(lockPath);
        return acquireLock(folderPath);
      }
    } catch {
      try {
        const handle = await open(lockPath, 'wx');
        await handle.close();
      } catch {
        throw new Error('Otro usuario está actualizando el resumen de Paritaria. Inténtalo de nuevo en unos segundos.');
      }
      return async () => { await unlink(lockPath).catch(() => undefined); };
    }
    throw new Error('Otro usuario está actualizando el resumen de Paritaria. Inténtalo de nuevo en unos segundos.');
  }
  return async () => { await unlink(lockPath).catch(() => undefined); };
}

export async function updateParitariaSummaryWord(payload: ParitariaSummaryUpdatePayload): Promise<ParitariaSummaryUpdateResult> {
  const folderPath = payload.folderPath.trim();
  if (!folderPath) {
    return { ok: false, message: 'No hay carpeta configurada para el resumen histórico de Paritaria. Configúrala en Ajustes.' };
  }

  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const folderInfo = await stat(folderPath);
    if (!folderInfo.isDirectory()) throw new Error('La ruta configurada para el resumen de Paritaria no es una carpeta.');

    releaseLock = await acquireLock(folderPath);
    const entries = await readdir(folderPath, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('~$') && SUMMARY_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name);

    if (candidates.length === 0) {
      throw new Error('No se ha encontrado el Word “Resumen TEMÁTICA Comisión paritaria (fecha).docx” en la carpeta configurada.');
    }
    if (candidates.length > 1) {
      throw new Error(`Hay ${candidates.length} documentos de resumen compatibles en la carpeta. Deja un único documento vigente para evitar actualizar el archivo equivocado.`);
    }

    const sourcePath = path.join(folderPath, candidates[0]);
    const sourceBuffer = await readFile(sourcePath);
    const zip = await JSZip.loadAsync(sourceBuffer);
    const documentEntry = zip.file('word/document.xml');
    if (!documentEntry) throw new Error('El DOCX no contiene word/document.xml.');

    const documentXml = await documentEntry.async('string');
    const updated = updateParitariaSummaryDocumentXml(documentXml, payload);
    if (updated.alreadyPresent) {
      return { ok: true, alreadyPresent: true, filePath: sourcePath, message: `La Paritaria ${payload.code} ya figura en el resumen histórico.` };
    }

    zip.file('word/document.xml', updated.xml);
    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const targetName = `Resumen TEMÁTICA Comisión paritaria (${formatUpdatedFileDate(new Date())}).docx`;
    const targetPath = path.join(folderPath, targetName);
    const tempPath = path.join(folderPath, `.${targetName}.${process.pid}.${Date.now()}.tmp`);

    if (targetPath !== sourcePath) {
      try {
        await stat(targetPath);
        throw new Error(`Ya existe ${targetName}. No se ha sustituido automáticamente para evitar sobrescribir otra actualización.`);
      } catch (error) {
        if (error instanceof Error && !('code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT')) throw error;
      }
    }

    await writeFile(tempPath, outputBuffer);
    const backupPath = `${sourcePath}.traccion-backup`;
    try {
      await unlink(backupPath).catch(() => undefined);
      await rename(sourcePath, backupPath);
      try {
        await rename(tempPath, targetPath);
        await unlink(backupPath);
      } catch (error) {
        await rename(backupPath, sourcePath).catch(() => undefined);
        throw error;
      }
    } finally {
      await unlink(tempPath).catch(() => undefined);
    }

    return { ok: true, filePath: targetPath, message: `Resumen histórico actualizado: ${targetName}` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido actualizar el resumen histórico de Paritaria.',
    };
  } finally {
    if (releaseLock) await releaseLock();
  }
}
