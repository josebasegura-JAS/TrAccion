import type { Employee } from '../../plantilla/domain/employee';
import {
  normalizeTicketCalendarName,
  splitTicketPersonFullName,
  type TicketCalendar,
  type TicketPersonDraft,
} from './ticketRestaurante';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

type TabularRow = string[];

type TicketPeopleImportField = 'empleado' | 'calendario';

export interface TicketPeopleImportDraft extends TicketPersonDraft {
  calendarName: string;
}

export interface TicketPeopleImportResult {
  drafts: TicketPeopleImportDraft[];
  ignored: number;
  missingEmployees: string[];
  duplicateRows: number;
}

const FIELD_BY_HEADER = new Map<string, TicketPeopleImportField>([
  ['empleado', 'empleado'],
  ['n empleado', 'empleado'],
  ['numero empleado', 'empleado'],
  ['num empleado', 'empleado'],
  ['cod empleado', 'empleado'],
  ['codigo empleado', 'empleado'],
  ['calendario', 'calendario'],
  ['calendar', 'calendario'],
]);

export async function importTicketPeopleFromFile(
  file: File,
  employees: readonly Employee[],
  calendars: readonly TicketCalendar[],
): Promise<TicketPeopleImportResult> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows = extension === 'csv' || extension === 'tsv' || extension === 'txt'
    ? parseDelimitedText(new TextDecoder().decode(buffer))
    : await parseXlsxRows(buffer);

  return rowsToTicketPeopleDrafts(rows, employees, calendars);
}

export function rowsToTicketPeopleDrafts(
  rows: TabularRow[],
  employees: readonly Employee[],
  calendars: readonly TicketCalendar[],
): TicketPeopleImportResult {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return { drafts: [], ignored: 0, missingEmployees: [], duplicateRows: 0 };
  }

  const fieldByColumn = headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null);
  const empleadoColumn = fieldByColumn.indexOf('empleado');
  const calendarioColumn = fieldByColumn.indexOf('calendario');

  if (empleadoColumn < 0 || calendarioColumn < 0) {
    return { drafts: [], ignored: dataRows.length, missingEmployees: [], duplicateRows: 0 };
  }

  const employeesById = new Map(
    employees
      .filter((employee) => !employee.deletedAt)
      .map((employee) => [normalizeEmployeeId(employee.empleado), employee]),
  );
  const calendarIdByName = new Map(
    calendars
      .filter((calendar) => !calendar.deletedAt)
      .map((calendar) => [normalizeTicketCalendarName(calendar.nombre), calendar.id]),
  );
  const draftsByEmpleado = new Map<string, TicketPeopleImportDraft>();
  const missingEmployees = new Set<string>();
  let ignored = 0;
  let duplicateRows = 0;

  dataRows.forEach((row) => {
    const empleado = normalizeEmployeeId(row[empleadoColumn] ?? '');
    const calendarName = cleanText(row[calendarioColumn] ?? '');

    if (!empleado || !calendarName) {
      ignored += 1;
      return;
    }

    const employee = employeesById.get(empleado);
    if (!employee) {
      missingEmployees.add(empleado);
      ignored += 1;
      return;
    }

    if (draftsByEmpleado.has(empleado)) {
      duplicateRows += 1;
    }

    const splitName = splitTicketPersonFullName(employee.nombreApellidos);

    draftsByEmpleado.set(empleado, {
      empleado: employee.empleado.trim(),
      nombre: splitName.nombre,
      apellido1: splitName.apellido1,
      apellido2: splitName.apellido2,
      dni: employee.dni || employee.nif || '',
      nombreApellidos: employee.nombreApellidos,
      puesto: employee.puestoNomina || employee.puestoOrganizativo,
      calendarId: calendarIdByName.get(normalizeTicketCalendarName(calendarName)) ?? '',
      calendarName,
      activo: true,
    });
  });

  return {
    drafts: Array.from(draftsByEmpleado.values()),
    ignored,
    missingEmployees: Array.from(missingEmployees.values()).sort((first, second) =>
      first.localeCompare(second, 'es', { numeric: true }),
    ),
    duplicateRows,
  };
}

export function normalizeCalendarName(value: string): string {
  return normalizeTicketCalendarName(cleanText(value));
}

function normalizeHeader(header: string): string {
  return header
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[_-]/g, ' ')
    .replace(/º/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmployeeId(value: string): string {
  return cleanText(value).replace(/\.0$/, '');
}

function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function parseDelimitedText(text: string): TabularRow[] {
  const delimiter = text.includes('\t') ? '\t' : ';';
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current);
  return values;
}

async function parseXlsxRows(buffer: ArrayBuffer): Promise<TabularRow[]> {
  const entries = readZipEntries(buffer);
  const decoder = new TextDecoder();
  const sharedStringsXml = await readZipText(buffer, entries, 'xl/sharedStrings.xml', decoder);
  const sheetXml = await readZipText(buffer, entries, 'xl/worksheets/sheet1.xml', decoder);

  if (!sheetXml) {
    return [];
  }

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  return parseSheetRows(sheetXml, sharedStrings);
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
