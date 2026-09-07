import { app } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

const TEMPLATE_FILE_NAME = 'Carga Tarjeta Cheque Gourmet.xlsx';
const SHEET_ENTRY_NAME = 'xl/worksheets/sheet1.xml';
const FIRST_DATA_ROW = 7;
const LAST_DATA_ROW = 1006;
const MAX_DATA_ROWS = LAST_DATA_ROW - FIRST_DATA_ROW + 1;

export interface TicketRestaurantLoadRow {
  nombre: string;
  apellido1: string;
  apellido2: string;
  dni: string;
  pedido: string;
  ceco: string;
  importeTotal: number;
  fechaInicio: string;
  fechaCaducidad: string;
}

interface ZipEntry {
  name: string;
  content: Buffer;
  isDirectory: boolean;
}

export async function buildTicketRestaurantLoadWorkbook(
  rows: readonly TicketRestaurantLoadRow[],
): Promise<Buffer> {
  validateRows(rows);

  const templatePath = path.join(app.getAppPath(), 'assets', 'templates', TEMPLATE_FILE_NAME);
  const template = await readFile(templatePath);
  const entries = readZipEntries(template);
  const sheetEntry = entries.find((entry) => entry.name === SHEET_ENTRY_NAME);

  if (!sheetEntry) {
    throw new Error('La plantilla de carga de Cheque Gourmet no contiene la hoja esperada.');
  }

  sheetEntry.content = Buffer.from(
    populateSheetXml(sheetEntry.content.toString('utf8'), rows),
    'utf8',
  );

  return writeZip(entries);
}

function validateRows(rows: readonly TicketRestaurantLoadRow[]): void {
  if (rows.length > MAX_DATA_ROWS) {
    throw new Error(
      `La plantilla admite un máximo de ${MAX_DATA_ROWS} registros y se han generado ${rows.length}.`,
    );
  }

  rows.forEach((row, index) => {
    const excelRow = FIRST_DATA_ROW + index;
    if (!row.dni.trim()) {
      throw new Error(`Falta el número de documento en la fila ${excelRow} (${displayPerson(row)}).`);
    }
    if (!row.pedido.trim()) {
      throw new Error(`Falta el nº de pedido en la fila ${excelRow}.`);
    }
    if (row.pedido.length > 15) {
      throw new Error(`El nº de pedido supera 15 caracteres en la fila ${excelRow}.`);
    }
    if (row.ceco.length > 12) {
      throw new Error(`El CECO supera 12 caracteres en la fila ${excelRow} (${displayPerson(row)}).`);
    }
    if (!Number.isFinite(row.importeTotal)) {
      throw new Error(`El importe total no es válido en la fila ${excelRow} (${displayPerson(row)}).`);
    }
  });
}

function displayPerson(row: TicketRestaurantLoadRow): string {
  return [row.nombre, row.apellido1, row.apellido2].filter(Boolean).join(' ') || row.ceco;
}

function populateSheetXml(
  xml: string,
  rows: readonly TicketRestaurantLoadRow[],
): string {
  let result = xml;

  rows.forEach((row, index) => {
    const rowNumber = FIRST_DATA_ROW + index;
    const replacement = buildDataRowXml(rowNumber, row);
    const rowPattern = new RegExp(`<row r="${rowNumber}"[^>]*>[\\s\\S]*?<\\/row>`);

    if (!rowPattern.test(result)) {
      throw new Error(`La plantilla no contiene la fila de datos ${rowNumber}.`);
    }
    result = result.replace(rowPattern, replacement);
  });

  return result;
}

function buildDataRowXml(rowNumber: number, row: TicketRestaurantLoadRow): string {
  return `<row r="${rowNumber}">${[
    inlineStringCell(`A${rowNumber}`, 15, row.nombre),
    inlineStringCell(`B${rowNumber}`, 15, row.apellido1),
    inlineStringCell(`C${rowNumber}`, 15, row.apellido2),
    inlineStringCell(`D${rowNumber}`, 16, row.dni),
    inlineStringCell(`E${rowNumber}`, 16, row.pedido),
    inlineStringCell(`F${rowNumber}`, 15, row.ceco),
    numericCell(`G${rowNumber}`, 17, row.importeTotal),
    inlineStringCell(`H${rowNumber}`, 16, row.fechaInicio),
    inlineStringCell(`I${rowNumber}`, 16, row.fechaCaducidad),
  ].join('')}</row>`;
}

function inlineStringCell(reference: string, style: number, value: string): string {
  if (!value) {
    return `<c r="${reference}" s="${style}"/>`;
  }
  const escaped = escapeXml(value);
  const preserveSpace = /^\s|\s$/.test(value) ? ' xml:space="preserve"' : '';
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t${preserveSpace}>${escaped}</t></is></c>`;
}

function numericCell(reference: string, style: number, value: number): string {
  return `<c r="${reference}" s="${style}"><v>${String(value)}</v></c>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('La plantilla XLSX contiene un ZIP no válido.');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error('La plantilla XLSX contiene una cabecera ZIP no válida.');
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let content: Buffer;

    if (compressionMethod === 0) {
      content = Buffer.from(compressed);
    } else if (compressionMethod === 8) {
      content = inflateRawSync(compressed);
    } else {
      throw new Error(`Método de compresión XLSX no soportado: ${compressionMethod}.`);
    }

    entries.push({ name, content, isDirectory: name.endsWith('/') });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  throw new Error('La plantilla XLSX no contiene un directorio ZIP válido.');
}

function writeZip(entries: readonly ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  entries.forEach((entry) => {
    const name = Buffer.from(entry.name, 'utf8');
    const content = entry.content;
    const compressed = entry.isDirectory ? Buffer.alloc(0) : deflateRawSync(content);
    const method = entry.isDirectory ? 0 : 8;
    const crc = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, name, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(entry.isDirectory ? 0x10 : 0, 38);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);

    localOffset += localHeader.length + name.length + compressed.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

const CRC32_TABLE = buildCrc32Table();

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
