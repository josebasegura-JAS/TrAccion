import type { Employee } from '../../plantilla/domain/employee';
import {
  EMPTY_TELETRABAJO_DRAFT,
  type TeletrabajoDia,
  type TeletrabajoDraft,
  type TeletrabajoSolicitud,
  type TeletrabajoTipoSolicitud,
} from './solicitud';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

type TabularRow = string[];
type EncuestaField =
  | 'empleado'
  | 'nombreApellidos'
  | 'tipoSolicitud'
  | 'diasTeletrabajo'
  | 'periodo'
  | 'observaciones';

export interface ImportEncuestaSummary {
  imported: number;
  updated: number;
  ignored: number;
}

export interface ImportEncuestaResult {
  solicitudes: TeletrabajoSolicitud[];
  summary: ImportEncuestaSummary;
}

interface EncuestaParseOptions {
  defaultPeriodo?: string;
  now?: Date;
}

const HEADER_ALIASES: ReadonlyArray<readonly [EncuestaField, readonly string[]]> = [
  [
    'empleado',
    [
      'empleado',
      'nº empleado',
      'numero empleado',
      'número empleado',
      'num empleado',
      'cod empleado',
      'codigo empleado',
      'código empleado',
    ],
  ],
  [
    'nombreApellidos',
    ['nombreApellidos', 'nombre apellidos', 'nombre y apellidos', 'nombre completo', 'persona'],
  ],
  [
    'tipoSolicitud',
    ['tipo solicitud', 'tipo', 'nueva renovacion', 'nueva renovación', 'renovación', 'renovacion'],
  ],
  [
    'diasTeletrabajo',
    [
      'dias teletrabajo',
      'días teletrabajo',
      'dias',
      'días',
      'dia elegido',
      'día elegido',
      'jornada teletrabajo',
    ],
  ],
  ['periodo', ['periodo', 'período', 'campaña', 'campana', 'curso']],
  ['observaciones', ['observaciones', 'comentario', 'comentarios', 'notas']],
];

const FIELD_BY_HEADER = buildFieldByHeader();

function buildFieldByHeader(): Map<string, EncuestaField> {
  return new Map(
    HEADER_ALIASES.flatMap(([field, aliases]) =>
      aliases.map((alias): [string, EncuestaField] => [normalizeHeader(alias), field]),
    ),
  );
}

export async function importEncuestaFromFile(
  file: File,
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: EncuestaParseOptions = {},
): Promise<ImportEncuestaResult> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows =
    extension === 'csv' || extension === 'tsv' || extension === 'txt'
      ? parseDelimitedText(new TextDecoder().decode(buffer), extension)
      : await parseXlsxRows(buffer);

  return importEncuestaRows(rows, employees, currentSolicitudes, options);
}

export function importEncuestaRows(
  rows: readonly TabularRow[],
  employees: readonly Employee[],
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  options: EncuestaParseOptions = {},
): ImportEncuestaResult {
  const now = options.now ?? new Date();
  const defaultPeriodo = options.defaultPeriodo ?? getDefaultPeriodo(now);
  const drafts = rowsToTeletrabajoDrafts(rows, employees, defaultPeriodo);
  return upsertEncuestaSolicitudes(currentSolicitudes, drafts, now);
}

export function rowsToTeletrabajoDrafts(
  rows: readonly TabularRow[],
  employees: readonly Employee[],
  defaultPeriodo = getDefaultPeriodo(new Date()),
): { drafts: TeletrabajoDraft[]; ignored: number } {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return { drafts: [], ignored: 0 };
  }

  const fieldByColumn = headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null);
  const employeesByEmpleado = new Map(
    employees.map((employee): [string, Employee] => [employee.empleado.trim(), employee]),
  );
  const drafts: TeletrabajoDraft[] = [];
  let ignored = 0;

  dataRows.forEach((row) => {
    const raw = readEncuestaRow(row, fieldByColumn);
    const empleado = raw.empleado.trim();

    if (!empleado) {
      ignored += 1;
      return;
    }

    const employee = employeesByEmpleado.get(empleado);
    drafts.push({
      ...EMPTY_TELETRABAJO_DRAFT,
      empleado,
      nombreApellidos: employee?.nombreApellidos ?? raw.nombreApellidos.trim(),
      puestoNomina: employee?.puestoNomina ?? '',
      puestoOrganizativo: employee?.puestoOrganizativo ?? '',
      residencia: employee?.residencia ?? '',
      dni: employee?.dni ?? '',
      direccionTeletrabajo: employee?.direccionTeletrabajo ?? '',
      estado: 'pendiente',
      tipoSolicitud: normalizeTipoSolicitud(raw.tipoSolicitud),
      diasTeletrabajo: normalizeEncuestaDias(raw.diasTeletrabajo),
      periodo: raw.periodo.trim() || defaultPeriodo,
      observaciones: raw.observaciones.trim(),
      validacionSeguridadInformatica: false,
      validacionPrevencion: false,
      validacionJefatura: false,
    });
  });

  return { drafts, ignored };
}

function readEncuestaRow(
  row: readonly string[],
  fieldByColumn: readonly (EncuestaField | null)[],
): Record<EncuestaField, string> {
  const values: Record<EncuestaField, string> = {
    empleado: '',
    nombreApellidos: '',
    tipoSolicitud: '',
    diasTeletrabajo: '',
    periodo: '',
    observaciones: '',
  };

  fieldByColumn.forEach((field, index) => {
    if (field) {
      values[field] = row[index]?.trim() ?? '';
    }
  });

  return values;
}

function upsertEncuestaSolicitudes(
  currentSolicitudes: readonly TeletrabajoSolicitud[],
  draftsResult: { drafts: TeletrabajoDraft[]; ignored: number },
  nowDate: Date,
): ImportEncuestaResult {
  const now = nowDate.toISOString();
  const solicitudes = [...currentSolicitudes];
  const indexByKey = new Map(
    solicitudes.map((solicitud, index): [string, number] => [getSolicitudKey(solicitud.empleado, solicitud.periodo), index]),
  );
  let imported = 0;
  let updated = 0;

  draftsResult.drafts.forEach((draft) => {
    const key = getSolicitudKey(draft.empleado, draft.periodo);
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      const solicitud: TeletrabajoSolicitud = {
        id: createSolicitudId(),
        ...draft,
        fechaSolicitud: draft.fechaSolicitud || nowDate.toISOString().slice(0, 10),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      solicitudes.push(solicitud);
      indexByKey.set(key, solicitudes.length - 1);
      imported += 1;
      return;
    }

    const previous = solicitudes[existingIndex];
    solicitudes[existingIndex] = {
      ...previous,
      ...draft,
      fechaSolicitud: draft.fechaSolicitud || previous.fechaSolicitud,
      createdAt: previous.createdAt,
      updatedAt: now,
      deletedAt: previous.deletedAt,
    };
    updated += 1;
  });

  return { solicitudes, summary: { imported, updated, ignored: draftsResult.ignored } };
}

function getSolicitudKey(empleado: string, periodo: string): string {
  return `${empleado.trim()}::${periodo.trim()}`;
}

function createSolicitudId(): string {
  return `teletrabajo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultPeriodo(date: Date): string {
  const year = date.getFullYear();
  return `${year}-${year + 1}`;
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

function normalizeTipoSolicitud(value: string): TeletrabajoTipoSolicitud {
  const normalized = normalizeHeader(value);

  if (normalized.includes('renovacion')) {
    return 'renovacion';
  }

  if (normalized.includes('nueva')) {
    return 'nueva';
  }

  return 'nueva';
}

function normalizeEncuestaDias(value: string): TeletrabajoDia[] {
  const normalized = normalizeHeader(value);
  const days: TeletrabajoDia[] = [];

  if (normalized.includes('martes')) {
    days.push('martes');
  }

  if (normalized.includes('miercoles')) {
    days.push('miercoles');
  }

  if (normalized.includes('jueves')) {
    days.push('jueves');
  }

  return days;
}

function parseDelimitedText(text: string, extension: string): TabularRow[] {
  const delimiter = extension === 'tsv' || text.includes('\t') ? '\t' : getCsvDelimiter(text);
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => parseDelimitedLine(line, delimiter));
}

function getCsvDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  return commaCount > semicolonCount ? ',' : ';';
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
  entries: readonly ZipEntry[],
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

function parseSheetRows(xml: string, sharedStrings: readonly string[]): TabularRow[] {
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

function readCellValue(cell: Element, sharedStrings: readonly string[]): string {
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
