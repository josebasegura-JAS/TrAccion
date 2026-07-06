/**
 * Lector de hojas XLSX compartido por todos los importadores de Excel de la app.
 *
 * Un fichero .xlsx es en realidad un ZIP con XML dentro. En vez de depender de una
 * librería pesada solo para leer, este módulo implementa lo mínimo necesario a mano:
 * - Lectura del directorio central del ZIP (sin dependencias externas).
 * - Descompresión DEFLATE vía la API nativa `DecompressionStream('deflate-raw')`.
 * - Resolución de la primera hoja real del libro (a través de `workbook.xml` y sus
 *   relaciones), en vez de asumir que siempre es el fichero `xl/worksheets/sheet1.xml`.
 *   Esa asunción se rompe si el libro se guardó con las hojas reordenadas o tras borrar
 *   una hoja, porque Excel no siempre renumera los ficheros internos empezando en 1.
 * - Parseo de `sharedStrings.xml` y de la hoja para devolver filas de texto plano.
 *
 * Todos los importadores de Excel de la app deben usar `parseXlsxRows` en vez de
 * reimplementar este parser.
 */

export interface XlsxZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

export type TabularRow = string[];

/**
 * Parsea un .xlsx (como ArrayBuffer) y devuelve las filas de su primera hoja como
 * texto plano. Cada fila es un array de celdas; las celdas vacías intermedias se
 * devuelven como cadena vacía para conservar el índice de columna.
 */
export async function parseXlsxRows(buffer: ArrayBuffer): Promise<TabularRow[]> {
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

function readZipEntries(buffer: ArrayBuffer): XlsxZipEntry[] {
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) {
    return [];
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries: XlsxZipEntry[] = [];

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
  entries: XlsxZipEntry[],
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
  const compressedStream = new Response(payload.buffer).body;
  if (!compressedStream) {
    throw new Error('No se ha podido leer el contenido comprimido del Excel.');
  }
  const stream = compressedStream.pipeThrough(new DecompressionStream('deflate-raw'));
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
