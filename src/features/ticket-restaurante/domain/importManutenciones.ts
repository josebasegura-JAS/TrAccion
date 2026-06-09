import type { TicketPerson } from './ticketRestaurante';

export interface TicketManutencionPreviewRow {
  id: string;
  empleado: string;
  nombreApellidos: string;
  fechaGasto: string;
  origen: 'Pagador' | 'Repartido entre' | 'Manual';
  importar: boolean;
  afectaTicket: boolean;
  errors: string[];
}

export interface TicketManutencionDraft {
  empleado: string;
  nombreApellidos: string;
  fechaGasto: string;
  origen: 'Pagador' | 'Repartido entre' | 'Manual';
  afectaTicket: boolean;
  imputacionYear: number;
  imputacionMonth: number;
}

export interface TicketManutencion extends TicketManutencionDraft {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

type TabularRow = string[];

export async function importTicketManutencionesFromFile(
  file: File,
  ticketPeople: readonly TicketPerson[],
): Promise<TicketManutencionPreviewRow[]> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows =
    extension === 'csv' || extension === 'tsv' || extension === 'txt'
      ? parseDelimitedText(new TextDecoder().decode(buffer), extension)
      : await parseXlsxRows(buffer);

  return importTicketManutenciones(rows, ticketPeople);
}

export function importTicketManutenciones(
  rows: readonly TabularRow[],
  ticketPeople: readonly TicketPerson[],
): TicketManutencionPreviewRow[] {
  const peopleByEmployee = buildTicketPeopleMap(ticketPeople);
  const structuredRows = importStructuredManutenciones(rows, peopleByEmployee);
  if (structuredRows.length > 0) {
    return deduplicatePreviewRows(structuredRows);
  }

  const parsed: TicketManutencionPreviewRow[] = [];
  const startIndex = findManutencionStartIndex(rows);
  const candidateRows = rows.slice(startIndex >= 0 ? startIndex : 0);

  candidateRows.forEach((row, index) => {
    const text = row.map(cleanText).filter(Boolean).join(' ');
    if (!text || isIgnoredRow(text)) return;

    const employees = extractEmployees(text);
    const fechaGasto = extractDate(row) || extractDateFromText(text);
    if (!fechaGasto || employees.length === 0) return;

    employees.forEach((employee, employeeIndex) => {
      const ticketPerson = peopleByEmployee.get(employee.empleado);
      if (!ticketPerson) return;

      parsed.push({
        id: `manutencion-preview-${index + 1}-${employee.empleado}-${employeeIndex}`,
        empleado: ticketPerson.empleado,
        nombreApellidos: ticketPerson.nombreApellidos || employee.nombreApellidos,
        fechaGasto,
        origen: employeeIndex === 0 ? 'Pagador' : 'Repartido entre',
        importar: true,
        afectaTicket: true,
        errors: [],
      });
    });
  });

  return deduplicatePreviewRows(parsed);
}

export function buildTicketManutencion(
  draft: TicketManutencionDraft,
  now: string,
  id: string,
  previous?: TicketManutencion,
): TicketManutencion {
  return {
    id,
    empleado: normalizeEmployeeNumber(draft.empleado),
    nombreApellidos: cleanText(draft.nombreApellidos),
    fechaGasto: draft.fechaGasto,
    origen: draft.origen,
    afectaTicket: draft.afectaTicket,
    imputacionYear: draft.imputacionYear,
    imputacionMonth: draft.imputacionMonth,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function validateTicketManutencionPreviewRows(
  rows: readonly TicketManutencionPreviewRow[],
): TicketManutencionPreviewRow[] {
  return rows.map((row) => ({ ...row, errors: validatePreviewRow(row) }));
}

function validatePreviewRow(row: TicketManutencionPreviewRow): string[] {
  const errors: string[] = [];
  if (!/^\d+$/.test(row.empleado)) errors.push('Nº empleado obligatorio y numérico.');
  if (!row.nombreApellidos.trim()) errors.push('Nombre obligatorio.');
  if (!isIsoDate(row.fechaGasto)) errors.push('Fecha de gasto obligatoria.');
  return errors;
}

function findManutencionStartIndex(rows: readonly TabularRow[]): number {
  return rows.findIndex((row) => normalizeHeader(row.join(' ')).includes('gastos de manutencion'));
}

function buildTicketPeopleMap(ticketPeople: readonly TicketPerson[]): Map<string, TicketPerson> {
  return new Map(
    ticketPeople
      .filter((person) => person.activo && !person.deletedAt)
      .map((person) => [normalizeEmployeeNumber(person.empleado), person]),
  );
}

interface ManutencionColumns {
  empleado: number;
  nombre: number;
  fechaGasto: number;
  repartidoEmpleado: number;
  repartidoNombre: number;
}

function importStructuredManutenciones(
  rows: readonly TabularRow[],
  peopleByEmployee: ReadonlyMap<string, TicketPerson>,
): TicketManutencionPreviewRow[] {
  const headerIndex = findStructuredHeaderIndex(rows);
  if (headerIndex < 0) return [];

  const columns = resolveStructuredColumns(rows[headerIndex]);
  if (!columns) return [];

  const parsed: TicketManutencionPreviewRow[] = [];
  let currentPayer: { empleado: string; nombreApellidos: string } | null = null;
  let currentDate = '';

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowIndex = headerIndex + offset + 1;
    const text = row.map(cleanText).filter(Boolean).join(' ');
    if (!text || isIgnoredRow(text)) return;

    const payer = readEmployeePair(row, columns.empleado, columns.nombre);
    if (payer) {
      currentPayer = payer;
    }

    const rowDate = normalizeDate(row[columns.fechaGasto]);
    if (rowDate) {
      currentDate = rowDate;
    }

    if (currentPayer && rowDate) {
      pushPreviewRow(parsed, peopleByEmployee, currentPayer, rowDate, 'Pagador', rowIndex, 0);
    }

    const sharedPerson = readEmployeePair(row, columns.repartidoEmpleado, columns.repartidoNombre);
    if (sharedPerson && currentDate) {
      pushPreviewRow(parsed, peopleByEmployee, sharedPerson, currentDate, 'Repartido entre', rowIndex, 1);
    }
  });

  return parsed;
}

function findStructuredHeaderIndex(rows: readonly TabularRow[]): number {
  return rows.findIndex((row) => {
    const normalizedCells = row.map(normalizeHeader);
    return (
      normalizedCells.some((cell) => cell.includes('empleado')) &&
      normalizedCells.some((cell) => cell.includes('fecha gasto')) &&
      normalizedCells.some((cell) => cell.includes('repartido entre'))
    );
  });
}

function resolveStructuredColumns(row: readonly string[]): ManutencionColumns | null {
  const normalizedCells = row.map(normalizeHeader);
  const empleado = normalizedCells.findIndex((cell) => cell.includes('empleado'));
  const fechaGasto = normalizedCells.findIndex((cell) => cell.includes('fecha gasto'));
  const repartidoEmpleado = normalizedCells.findIndex((cell) => cell.includes('repartido entre'));

  if (empleado < 0 || fechaGasto < 0 || repartidoEmpleado < 0) return null;

  return {
    empleado,
    nombre: empleado + 1,
    fechaGasto,
    repartidoEmpleado,
    repartidoNombre: repartidoEmpleado + 1,
  };
}

function readEmployeePair(
  row: readonly string[],
  employeeColumn: number,
  nameColumn: number,
): { empleado: string; nombreApellidos: string } | null {
  const empleado = normalizeEmployeeNumber(row[employeeColumn]);
  if (!/^\d{1,6}$/.test(empleado)) return null;

  return {
    empleado,
    nombreApellidos: cleanText(row[nameColumn]),
  };
}

function pushPreviewRow(
  rows: TicketManutencionPreviewRow[],
  peopleByEmployee: ReadonlyMap<string, TicketPerson>,
  employee: { empleado: string; nombreApellidos: string },
  fechaGasto: string,
  origen: 'Pagador' | 'Repartido entre',
  rowIndex: number,
  employeeIndex: number,
): void {
  const ticketPerson = peopleByEmployee.get(employee.empleado);
  if (!ticketPerson) return;

  rows.push({
    id: `manutencion-preview-${rowIndex + 1}-${ticketPerson.empleado}-${employeeIndex}`,
    empleado: ticketPerson.empleado,
    nombreApellidos: ticketPerson.nombreApellidos || employee.nombreApellidos,
    fechaGasto,
    origen,
    importar: true,
    afectaTicket: true,
    errors: [],
  });
}

function isIgnoredRow(text: string): boolean {
  const normalized = normalizeHeader(text);
  return normalized.includes('gastos de manutencion') || normalized.includes('fecha desde');
}

function extractEmployees(text: string): { empleado: string; nombreApellidos: string }[] {
  const matches = Array.from(text.matchAll(/(?:^|\s)(\d{1,6})(?:\.0)?\s+([^\d;|]+?)(?=\s+\d{1,6}(?:\.0)?\s+|\s+\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4})|$)/g));
  return matches
    .map((match) => ({
      empleado: normalizeEmployeeNumber(match[1] ?? ''),
      nombreApellidos: cleanText(match[2] ?? ''),
    }))
    .filter((employee) => employee.empleado);
}

function extractDate(row: readonly string[]): string {
  for (const cell of row) {
    const value = normalizeDate(cell);
    if (value) return value;
  }
  return '';
}

function extractDateFromText(text: string): string {
  const match = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-](?:\d{2}|\d{4}))\b/);
  return match ? normalizeDate(match[1]) : '';
}

function deduplicatePreviewRows(rows: readonly TicketManutencionPreviewRow[]): TicketManutencionPreviewRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${normalizeEmployeeNumber(row.empleado)}|${row.fechaGasto}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeEmployeeNumber(value: unknown): string {
  return cleanText(value).replace(/^0+(?=\d)/, '').replace(/\.0$/, '');
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(header: unknown): string {
  return cleanText(header)
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

function normalizeDate(value: unknown): string {
  const text = cleanText(value);
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && isIsoDate(text)) return text;

  const separated = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (separated) {
    const day = Number(separated[1]);
    const month = Number(separated[2]);
    const year = Number(separated[3].length === 2 ? `20${separated[3]}` : separated[3]);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return isIsoDate(iso) ? iso : '';
  }

  const serial = Number(text.replace(',', '.'));
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = Date.UTC(1899, 11, 30);
    const date = new Date(epoch + serial * 86_400_000);
    return date.toISOString().slice(0, 10);
  }

  return '';
}

function parseDelimitedText(text: string, extension: string): TabularRow[] {
  const delimiter = extension === 'tsv' || text.includes('\t') ? '\t' : ';';
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
  if (!sheetXml) return [];
  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  return parseSheetRows(sheetXml, sharedStrings);
}

function readZipEntries(buffer: ArrayBuffer): ZipEntry[] {
  const view = new DataView(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) return [];
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
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
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }
  return -1;
}

async function readZipText(
  buffer: ArrayBuffer,
  entries: readonly ZipEntry[],
  name: string,
  decoder: TextDecoder,
): Promise<string> {
  const entry = entries.find((candidate) => candidate.name === name);
  if (!entry) return '';
  const view = new DataView(buffer);
  const localOffset = entry.localHeaderOffset;
  const nameLength = view.getUint16(localOffset + 26, true);
  const extraLength = view.getUint16(localOffset + 28, true);
  const dataOffset = localOffset + 30 + nameLength + extraLength;
  const compressed = new Uint8Array(buffer, dataOffset, entry.compressedSize);
  if (entry.method === 0) return decoder.decode(compressed);
  if (entry.method === 8) return decoder.decode(await inflateRaw(compressed));
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
    Array.from(item.getElementsByTagName('t')).map((textNode) => textNode.textContent ?? '').join(''),
  );
}

function parseSheetRows(xml: string, sharedStrings: readonly string[]): TabularRow[] {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(document.getElementsByTagName('row')).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName('c')).forEach((cell) => {
      const reference = cell.getAttribute('r') ?? '';
      const columnIndex = getColumnIndex(reference);
      values[columnIndex] = readCellValue(cell, sharedStrings);
    });
    return Array.from({ length: values.length }, (_, index) => values[index] ?? '');
  });
}

function readCellValue(cell: Element, sharedStrings: readonly string[]): string {
  const type = cell.getAttribute('t');
  const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
  if (type === 's') return sharedStrings[Number(value)] ?? '';
  if (type === 'inlineStr') {
    return Array.from(cell.getElementsByTagName('t')).map((textNode) => textNode.textContent ?? '').join('');
  }
  return value;
}

function getColumnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/)?.[0] ?? 'A';
  return letters.split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}
