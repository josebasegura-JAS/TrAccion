import { open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';

export interface CommitteeSummaryUpdatePayload {
  folderPath: string;
  code: string;
  date: string;
  points: string[];
}

export interface CommitteeSummaryUpdateResult {
  ok: boolean;
  message: string;
  filePath?: string;
  alreadyPresent?: boolean;
}

const SUMMARY_FILE_PATTERN = /^Resumen TEMÁTICA Comités de Empresa \(actualizado \d{2}-\d{2}-\d{2}\)\.docx$/i;
const LOCK_FILE_NAME = '.traccion-comite-summary.lock';
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

function replaceCellText(cellXml: string, value: string): string {
  return replaceElementText(cellXml, value);
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
    replaceCellText(cellXml, values[index] ?? ''),
  );
}

function replaceDetailPoints(rowXml: string, points: string[]): string {
  return replaceTopLevelElements(rowXml, 'w:tc', (cellXml, cellIndex) => {
    if (cellIndex !== 2) return replaceCellText(cellXml, '');

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
  if (!firstRow || !lastRow) {
    throw new Error('No se ha podido identificar la tabla histórica del documento.');
  }
  return `${tableXml.slice(0, firstRow.start)}${rows.join('')}${tableXml.slice(lastRow.end)}`;
}

function formatSessionDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return date;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function updateCommitteeSummaryDocumentXml(
  documentXml: string,
  payload: Pick<CommitteeSummaryUpdatePayload, 'code' | 'date' | 'points'>,
): { xml: string; alreadyPresent: boolean } {
  const code = compactText(payload.code);
  const points = payload.points.map(compactText).filter(Boolean);
  if (!code) throw new Error('La sesión no tiene código. No se puede actualizar el resumen histórico.');
  if (!payload.date) throw new Error('La sesión no tiene fecha. No se puede actualizar el resumen histórico.');
  if (textFromXml(documentXml).includes(code)) return { xml: documentXml, alreadyPresent: true };

  const year = payload.date.slice(0, 4);
  const tableMatch = extractElements(documentXml, 'w:tbl').find((element) => {
    const rows = tableRows(element.xml);
    return rows.some((row) => textFromXml(row) === year);
  });
  if (!tableMatch) {
    throw new Error(`No se ha encontrado el bloque del año ${year} en el resumen histórico.`);
  }

  const tableXml = tableMatch.xml;
  const rows = tableRows(tableXml);
  const yearRowIndex = rows.findIndex((row) => textFromXml(row) === year);
  if (yearRowIndex < 0) throw new Error(`No se ha encontrado la fila del año ${year}.`);

  let insertionIndex = yearRowIndex + 1;
  const nextText = textFromXml(rows[insertionIndex] ?? '');
  if (/\d{2}-PE-AR-0xx/i.test(nextText)) {
    insertionIndex += 1;
    if (!textFromXml(rows[insertionIndex] ?? '')) insertionIndex += 1;
  }

  let headerTemplateIndex = insertionIndex;
  while (headerTemplateIndex < rows.length) {
    const rowText = textFromXml(rows[headerTemplateIndex]);
    if (/\d{2}-(?:PE|CP)-AR-/i.test(rowText) && /Orden del d[ií]a/i.test(rowText)) break;
    headerTemplateIndex += 1;
  }
  if (headerTemplateIndex >= rows.length) throw new Error('No se ha encontrado una reunión de referencia para conservar el formato Word.');

  const detailTemplateIndex = headerTemplateIndex + 1;
  if (!rows[detailTemplateIndex]) throw new Error('No se ha encontrado la fila de puntos de referencia del Word.');

  const headerRow = replaceRowCells(rows[headerTemplateIndex], [code, formatSessionDate(payload.date), 'Orden del día', '']);
  const detailRow = replaceDetailPoints(rows[detailTemplateIndex], points);
  rows.splice(insertionIndex, 0, headerRow, detailRow);

  const updatedTable = replaceTableRows(tableXml, rows);
  const start = tableMatch.start;
  return {
    xml: `${documentXml.slice(0, start)}${updatedTable}${documentXml.slice(start + tableXml.length)}`,
    alreadyPresent: false,
  };
}

function formatUpdatedFileDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
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
      // El bloqueo desapareció entre comprobaciones; reintentamos una vez.
      try {
        const handle = await open(lockPath, 'wx');
        await handle.close();
      } catch {
        throw new Error('Otro usuario está actualizando el resumen de Comité. Inténtalo de nuevo en unos segundos.');
      }
      return async () => { await unlink(lockPath).catch(() => undefined); };
    }
    throw new Error('Otro usuario está actualizando el resumen de Comité. Inténtalo de nuevo en unos segundos.');
  }
  return async () => { await unlink(lockPath).catch(() => undefined); };
}

export async function updateCommitteeSummaryWord(payload: CommitteeSummaryUpdatePayload): Promise<CommitteeSummaryUpdateResult> {
  const folderPath = payload.folderPath.trim();
  if (!folderPath) {
    return { ok: false, message: 'No hay carpeta configurada para el resumen histórico de Comité. Configúrala en Ajustes.' };
  }

  let releaseLock: (() => Promise<void>) | null = null;
  try {
    const folderInfo = await stat(folderPath);
    if (!folderInfo.isDirectory()) throw new Error('La ruta configurada para el resumen de Comité no es una carpeta.');

    releaseLock = await acquireLock(folderPath);
    const entries = await readdir(folderPath, { withFileTypes: true });
    const candidates = entries
      .filter((entry) => entry.isFile() && SUMMARY_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name);

    if (candidates.length === 0) {
      throw new Error('No se ha encontrado el Word “Resumen TEMÁTICA Comités de Empresa (actualizado DD-MM-AA).docx” en la carpeta configurada.');
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
    const updated = updateCommitteeSummaryDocumentXml(documentXml, payload);
    if (updated.alreadyPresent) {
      return { ok: true, alreadyPresent: true, filePath: sourcePath, message: `El Comité ${payload.code} ya figura en el resumen histórico.` };
    }

    zip.file('word/document.xml', updated.xml);
    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const targetName = `Resumen TEMÁTICA Comités de Empresa (actualizado ${formatUpdatedFileDate(new Date())}).docx`;
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
      message: error instanceof Error ? error.message : 'No se ha podido actualizar el resumen histórico de Comité.',
    };
  } finally {
    if (releaseLock) await releaseLock();
  }
}
