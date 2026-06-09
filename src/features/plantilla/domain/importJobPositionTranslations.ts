import { type JobPositionTranslation, normalizeJobPosition } from './jobPositionTranslation';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

type TabularRow = string[];

const CASTELLANO_HEADERS = new Set(['puesto']);
const EUSKERA_HEADERS = new Set(['lanpostua']);

export async function importJobPositionTranslationsFromFile(
  file: File,
): Promise<JobPositionTranslation[]> {
  const buffer = await file.arrayBuffer();
  const rows = await parseXlsxRows(buffer);
  return rowsToJobPositionTranslations(rows);
}

export function rowsToJobPositionTranslations(rows: TabularRow[]): JobPositionTranslation[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const castellanoIndex = normalizedHeaders.findIndex((header) => CASTELLANO_HEADERS.has(header));
  const euskeraIndex = normalizedHeaders.findIndex((header) => EUSKERA_HEADERS.has(header));

  if (castellanoIndex < 0 || euskeraIndex < 0) {
    throw new Error('La Excel debe tener las columnas exactas Puesto y Lanpostua.');
  }

  const translationsByPuesto = new Map<string, JobPositionTranslation>();

  dataRows.forEach((row) => {
    const puestoCastellano = row[castellanoIndex]?.trim() ?? '';
    const puestoEuskera = row[euskeraIndex]?.trim() ?? '';

    if (!puestoCastellano || !puestoEuskera) {
      return;
    }

    translationsByPuesto.set(normalizeJobPosition(puestoCastellano), {
      puestoCastellano,
      puestoEuskera,
    });
  });

  return Array.from(translationsByPuesto.values()).sort((first, second) =>
    first.puestoCastellano.localeCompare(second.puestoCastellano, 'es', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function parseXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = readZipEntries(buffer);
  const decoder = new TextDecoder();
  const workbookXml = await readZipText(buffer, entries, 'xl/workbook.xml', decoder);
  const workbookRelsXml = await readZipText(buffer, entries, 'xl/_rels/workbook.xml.rels', decoder);
  const sheetName = findFirstSheetPath(workbookXml, workbookRelsXml) ?? 'xl/worksheets/sheet1.xml';
  const sharedStringsXml = await readZipText(buffer, entries, 'xl/sharedStrings.xml', decoder);
  const sheetXml = await readZipText(buffer, entries, sheetName, decoder);

  if (!sheetXml) {
    return [];
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  return parseSheetRows(sheetXml, sharedStrings);
}

function findFirstSheetPath(workbookXml: string, workbookRelsXml: string): string | null {
  if (!workbookXml || !workbookRelsXml) {
    return null;
  }

  const workbookDocument = new DOMParser().parseFromString(workbookXml, 'application/xml');
  const firstSheet = workbookDocument.getElementsByTagName('sheet')[0];
  const relationshipId = firstSheet?.getAttribute('r:id');

  if (!relationshipId) {
    return null;
  }

  const relsDocument = new DOMParser().parseFromString(workbookRelsXml, 'application/xml');
  const relationship = Array.from(relsDocument.getElementsByTagName('Relationship')).find(
    (candidate) => candidate.getAttribute('Id') === relationshipId,
  );
  const target = relationship?.getAttribute('Target');

  if (!target) {
    return null;
  }

  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`;
}

function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) {
    return [];
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      break;
    }

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameBytes = new Uint8Array(buffer, offset + 46, nameLength);
    const name = new TextDecoder().decode(nameBytes);

    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

async function readZipText(
  buffer: ArrayBuffer,
  entries: ZipEntry[],
  name: string,
  decoder: TextDecoder,
): Promise<string> {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) {
    return '';
  }

  const view = new DataView(buffer);
  const localOffset = entry.localHeaderOffset;
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = new Uint8Array(buffer, dataOffset, entry.compressedSize);

  if (entry.method === 0) {
    return decoder.decode(compressed);
  }

  if (entry.method === 8) {
    return decoder.decode(await inflateRaw(compressed));
  }

  return '';
}

async function inflateRaw(data: Uint8Array): Promise<ArrayBuffer> {
  const payload = new Uint8Array(data.byteLength);
  payload.set(data);
  const stream = new Blob([payload.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

function parseSharedStrings(xml: string): string[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(document.getElementsByTagName('si')).map((item) =>
    Array.from(item.getElementsByTagName('t'))
      .map((textNode) => textNode.textContent ?? '')
      .join(''),
  );
}

function parseSheetRows(xml: string, sharedStrings: string[]): TabularRow[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(document.getElementsByTagName('row')).map((row) => {
    const values: string[] = [];

    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const reference = cell.getAttribute('r') ?? '';
      const columnIndex = getColumnIndex(reference);
      values[columnIndex] = readCellValue(cell, sharedStrings);
    });

    return values.map((value) => value ?? '');
  });
}

function readCellValue(cell: Element, sharedStrings: string[]): string {
  const type = cell.getAttribute('t');
  const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';

  if (type === 's') {
    return sharedStrings[Number(value)] ?? '';
  }

  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t'))
      .map((textNode) => textNode.textContent ?? '')
      .join('');
  }

  return value;
}

function getColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
