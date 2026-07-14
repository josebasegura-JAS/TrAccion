import {
  TICKET_RESTAURANT_MIN_ABSENCE_DATE,
  buildTicketRestaurantAbsence,
  normalizeTicketEmployeeNumber,
  isIsoDate,
  type TicketRestaurantAbsence,
} from './ticketRestaurante';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseDelimitedText } from '../../../shared/import/delimitedText';

export type TicketRestaurantAbsenceFormat = 'clean' | 'zerkos';
export type TicketRestaurantAbsenceField =
  | 'empleado'
  | 'nombreApellidos'
  | 'desde'
  | 'hasta'
  | 'motivo'
  | 'totalDias'
  | 'afectaTicket';

export interface TicketRestaurantAbsencePreviewRow {
  id: string;
  empleado: string;
  nombreApellidos: string;
  desde: string;
  hasta: string;
  motivo: string;
  totalDias: string;
  afectaTicket: boolean;
  errors: string[];
}

export interface TicketRestaurantAbsenceImportSummary {
  nuevas: number;
  sustituidas: number;
  duplicadas: number;
  invalidas: number;
}

export interface TicketRestaurantAbsenceSaveResult {
  absences: TicketRestaurantAbsence[];
  summary: TicketRestaurantAbsenceImportSummary;
  errors: string[];
}

type TabularRow = string[];
type RawAbsenceRow = Partial<Record<TicketRestaurantAbsenceField, string>>;

const CLEAN_REQUIRED_FIELDS: TicketRestaurantAbsenceField[] = [
  'empleado',
  'nombreApellidos',
  'desde',
  'hasta',
  'motivo',
  'totalDias',
];
const ZERKOS_LABELS = [
  'empleado',
  'puesto organizativo',
  'residencia',
  'nivel',
  'aus',
  'ano',
  'desde',
  'hasta',
  'dias',
  'j',
];
const HEADER_ALIASES: ReadonlyArray<readonly [TicketRestaurantAbsenceField, readonly string[]]> = [
  ['empleado', ['n empleado', 'num empleado', 'numero empleado', 'nº empleado', 'empleado']],
  [
    'nombreApellidos',
    ['nombre y apellidos', 'nombre apellidos', 'nombre completo', 'apellidos y nombre'],
  ],
  ['desde', ['desde', 'fecha desde', 'from', 'from date']],
  ['hasta', ['hasta', 'fecha hasta', 'to', 'to date']],
  ['motivo', ['motivo', 'aus', 'ausencia', 'reason']],
  ['totalDias', ['total dias', 'total días', 'dias', 'días', 'dias naturales']],
  ['afectaTicket', ['afecta ticket', 'ticket', 'computable']],
];

const FIELD_BY_HEADER = new Map(
  HEADER_ALIASES.flatMap(([field, aliases]) =>
    aliases.map((alias): [string, TicketRestaurantAbsenceField] => [normalizeHeader(alias), field]),
  ),
);

export async function importTicketRestaurantAbsencesFromFile(
  file: File,
): Promise<TicketRestaurantAbsencePreviewRow[]> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows =
    extension === 'csv' || extension === 'tsv' || extension === 'txt'
      ? parseDelimitedText(new TextDecoder().decode(buffer), extension)
      : await parseXlsxRows(buffer);

  return importTicketRestaurantAbsences(rows);
}

export function importTicketRestaurantAbsences(
  rows: readonly TabularRow[],
): TicketRestaurantAbsencePreviewRow[] {
  const format = detectTicketRestaurantAbsenceFormat(rows);

  if (format === 'clean') {
    return parseTicketRestaurantCleanAbsenceRows(rows);
  }

  if (format === 'zerkos') {
    return parseTicketRestaurantZerkosAbsenceRows(rows);
  }

  return [];
}

export function detectTicketRestaurantAbsenceFormat(
  rows: readonly TabularRow[],
): TicketRestaurantAbsenceFormat | null {
  if (findCleanHeaderIndex(rows) >= 0) {
    return 'clean';
  }

  return findZerkosHeaderIndex(rows) >= 0 ? 'zerkos' : null;
}

export function parseTicketRestaurantCleanAbsenceRows(
  rows: readonly TabularRow[],
): TicketRestaurantAbsencePreviewRow[] {
  const headerIndex = findCleanHeaderIndex(rows);
  if (headerIndex < 0) {
    return [];
  }

  const fieldByColumn = (rows[headerIndex] ?? []).map(
    (header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null,
  );

  return deduplicatePreviewRows(
    rows
      .slice(headerIndex + 1)
      .map((row) => readCleanRow(row, fieldByColumn))
      .filter(hasAnyValue)
      .map((row, index) => normalizeTicketRestaurantAbsenceRow(row, `preview-clean-${index + 1}`))
      .filter(isOnOrAfterMinimumAbsenceDate),
  );
}

export function parseTicketRestaurantZerkosAbsenceRows(
  rows: readonly TabularRow[],
): TicketRestaurantAbsencePreviewRow[] {
  const parsedRows: TicketRestaurantAbsencePreviewRow[] = [];
  let activeEmployee: Pick<RawAbsenceRow, 'empleado' | 'nombreApellidos'> = {};
  let fieldByColumn: (TicketRestaurantAbsenceField | null)[] = [];

  rows.forEach((row) => {
    if (isZerkosIgnoredRow(row)) {
      return;
    }

    const employee = readZerkosEmployee(row);
    if (employee.empleado) {
      activeEmployee = employee;
      return;
    }

    const candidateFields = row.map((cell) => FIELD_BY_HEADER.get(normalizeHeader(cell)) ?? null);
    if (candidateFields.includes('motivo') && candidateFields.includes('desde')) {
      fieldByColumn = candidateFields;
      return;
    }

    if (!activeEmployee.empleado) {
      return;
    }

    const raw = readZerkosAbsenceRow(row, fieldByColumn);
    if (!raw || !raw.desde) {
      return;
    }

    parsedRows.push(
      normalizeTicketRestaurantAbsenceRow(
        {
          ...raw,
          empleado: activeEmployee.empleado,
          nombreApellidos: activeEmployee.nombreApellidos ?? raw.nombreApellidos,
          motivo: raw.motivo?.toUpperCase(),
        },
        `preview-zerkos-${parsedRows.length + 1}`,
      ),
    );
  });

  return deduplicatePreviewRows(parsedRows.filter(isOnOrAfterMinimumAbsenceDate));
}

export function normalizeTicketRestaurantAbsenceRow(
  row: RawAbsenceRow,
  id: string,
): TicketRestaurantAbsencePreviewRow {
  const empleado = normalizeTicketEmployeeNumber(row.empleado ?? '');
  const desde = normalizeDate(row.desde ?? '');
  const hasta = normalizeDate(row.hasta ?? '') || desde;
  const totalDias =
    normalizeTotalDays(row.totalDias ?? '') || calculateInclusiveDaysText(desde, hasta);
  const previewRow: TicketRestaurantAbsencePreviewRow = {
    id,
    empleado,
    nombreApellidos: cleanText(row.nombreApellidos ?? ''),
    desde,
    hasta,
    motivo: cleanText(row.motivo ?? ''),
    totalDias,
    afectaTicket: normalizeAfectaTicket(row.afectaTicket, desde),
    errors: [],
  };

  return { ...previewRow, errors: validateTicketRestaurantAbsencePreviewRow(previewRow) };
}

export function validateTicketRestaurantAbsencePreviewRows(
  rows: readonly TicketRestaurantAbsencePreviewRow[],
): TicketRestaurantAbsencePreviewRow[] {
  return rows.map((row) => ({ ...row, errors: validateTicketRestaurantAbsencePreviewRow(row) }));
}

export function saveTicketRestaurantAbsencePreviewRows(
  current: readonly TicketRestaurantAbsence[],
  rows: readonly TicketRestaurantAbsencePreviewRow[],
  nowDate = new Date(),
): TicketRestaurantAbsenceSaveResult {
  const validatedRows = validateTicketRestaurantAbsencePreviewRows(rows);
  const invalidas = validatedRows.filter((row) => row.errors.length > 0).length;
  if (invalidas > 0) {
    return {
      absences: [...current],
      summary: { nuevas: 0, sustituidas: 0, duplicadas: 0, invalidas },
      errors: ['Hay filas con errores. Corrígelas antes de guardar.'],
    };
  }

  const summary: TicketRestaurantAbsenceImportSummary = {
    nuevas: 0,
    sustituidas: 0,
    duplicadas: 0,
    invalidas: 0,
  };
  const now = nowDate.toISOString();
  const result = current.filter((absence) => !absence.deletedAt).map((absence) => ({ ...absence }));
  const seen = new Set<string>();

  validatedRows.forEach((row) => {
    const exactKey = buildExactKey(row);
    if (seen.has(exactKey)) {
      summary.duplicadas += 1;
      return;
    }
    seen.add(exactKey);

    const exactExisting = result.find((absence) => buildAbsenceExactKey(absence) === exactKey);
    if (exactExisting) {
      summary.duplicadas += 1;
      return;
    }

    const overlappingIndexes = result
      .map((absence, index) => ({ absence, index }))
      .filter(({ absence }) => isOverlappingSameReason(absence, row))
      .map(({ index }) => index);

    overlappingIndexes
      .sort((first, second) => second - first)
      .forEach((index) => {
        result.splice(index, 1);
      });

    if (overlappingIndexes.length > 0) {
      summary.sustituidas += overlappingIndexes.length;
    } else {
      summary.nuevas += 1;
    }

    result.push(
      buildTicketRestaurantAbsence(
        {
          empleado: row.empleado,
          nombreApellidos: row.nombreApellidos,
          desde: row.desde,
          hasta: row.hasta,
          motivo: row.motivo,
          totalDias: Number(row.totalDias.replace(',', '.')),
          afectaTicket: row.afectaTicket,
        },
        now,
        `ticket-absence-${row.empleado}-${row.desde}-${row.hasta}-${result.length + 1}`,
      ),
    );
  });

  return { absences: result, summary, errors: [] };
}

function isOnOrAfterMinimumAbsenceDate(row: TicketRestaurantAbsencePreviewRow): boolean {
  return !isIsoDate(row.desde) || row.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE;
}

function validateTicketRestaurantAbsencePreviewRow(
  row: TicketRestaurantAbsencePreviewRow,
): string[] {
  const errors: string[] = [];
  if (!row.empleado) {
    errors.push('Nº empleado obligatorio.');
  } else if (!/^\d+$/.test(row.empleado)) {
    errors.push('Nº empleado debe ser numérico.');
  }

  if (!isIsoDate(row.desde)) {
    errors.push('Desde debe ser una fecha válida.');
  }

  if (!isIsoDate(row.hasta)) {
    errors.push('Hasta debe ser una fecha válida.');
  }

  if (isIsoDate(row.desde) && isIsoDate(row.hasta) && row.hasta < row.desde) {
    errors.push('Hasta no puede ser anterior a Desde.');
  }

  if (!row.motivo.trim()) {
    errors.push('Motivo obligatorio.');
  }

  const totalDias = Number(row.totalDias.replace(',', '.'));
  if (!row.totalDias.trim() || Number.isNaN(totalDias) || totalDias <= 0) {
    errors.push('Total días debe ser numérico y mayor que 0.');
  }

  return errors;
}

function findCleanHeaderIndex(rows: readonly TabularRow[]): number {
  return rows.findIndex((row) => {
    const fields = new Set(
      row.map((cell) => FIELD_BY_HEADER.get(normalizeHeader(cell))).filter(Boolean),
    );
    return CLEAN_REQUIRED_FIELDS.every((field) => fields.has(field));
  });
}

function readCleanRow(
  row: readonly string[],
  fieldByColumn: readonly (TicketRestaurantAbsenceField | null)[],
): RawAbsenceRow {
  const values: RawAbsenceRow = {};
  fieldByColumn.forEach((field, index) => {
    if (field) {
      values[field] = row[index]?.trim() ?? '';
    }
  });
  return values;
}

function findZerkosHeaderIndex(rows: readonly TabularRow[]): number {
  const realHeaderIndex = rows.findIndex((row) => {
    const labels = new Set(row.map((cell) => normalizeHeader(cell)));
    const foundZerkosLabels = ZERKOS_LABELS.filter((label) => labels.has(label)).length;
    const hasEmployeeBlock =
      labels.has('empleado') && labels.has('puesto organizativo') && labels.has('residencia');
    const hasAbsenceBlock =
      labels.has('aus') && labels.has('ano') && labels.has('desde') && labels.has('hasta');
    return foundZerkosLabels >= 7 && hasEmployeeBlock && hasAbsenceBlock;
  });

  if (realHeaderIndex >= 0) {
    return realHeaderIndex;
  }

  const labels = new Set(rows.flatMap((row) => row.map((cell) => normalizeHeader(cell))));
  const foundZerkosLabels = ZERKOS_LABELS.filter((label) => labels.has(label)).length;
  return foundZerkosLabels >= 7 ? 0 : -1;
}

function readZerkosEmployee(
  row: readonly string[],
): Pick<RawAbsenceRow, 'empleado' | 'nombreApellidos'> {
  const firstCell = cleanText(row[0] ?? '');
  const employeeNumber = normalizeTicketEmployeeNumber(firstCell);
  if (
    /^\d+$/.test(employeeNumber) &&
    cleanText(row[1] ?? '') &&
    cleanText(row[2] ?? '') &&
    cleanText(row[3] ?? '') &&
    cleanText(row[4] ?? '')
  ) {
    return {
      empleado: employeeNumber,
      nombreApellidos: cleanText(row[1] ?? ''),
    };
  }

  const labelIndex = row.findIndex((cell) => normalizeHeader(cell) === 'empleado');
  if (labelIndex < 0) {
    return {};
  }

  const values = row
    .slice(labelIndex + 1)
    .map(cleanText)
    .filter(Boolean);
  const candidate = values.join(' ');
  const match = candidate.match(/^(\d+)\s*(.*)$/) ?? candidate.match(/(\d+)/);
  if (!match) {
    return {};
  }

  return {
    empleado: normalizeTicketEmployeeNumber(match[1] ?? ''),
    nombreApellidos: cleanText(
      match[2] ?? values.filter((value) => !/^\d+$/.test(value)).join(' '),
    ),
  };
}

function readZerkosAbsenceRow(
  row: readonly string[],
  fieldByColumn: readonly (TicketRestaurantAbsenceField | null)[],
): RawAbsenceRow | null {
  const fixedRow = readFixedZerkosAbsenceRow(row);
  if (fixedRow) {
    return fixedRow;
  }

  if (fieldByColumn.length === 0) {
    return null;
  }

  const raw = readCleanRow(row, fieldByColumn);
  if (!hasAnyValue(raw) || (!raw.desde && !raw.motivo)) {
    return null;
  }

  return raw;
}

function readFixedZerkosAbsenceRow(row: readonly string[]): RawAbsenceRow | null {
  const motivo = cleanText(row[0] ?? '');
  const desde = cleanText(row[2] ?? '');
  if (!isZerkosAbsenceCode(motivo) || !desde) {
    return null;
  }

  return {
    motivo,
    desde,
    hasta: cleanText(row[3] ?? ''),
    totalDias: cleanText(row[4] ?? ''),
    afectaTicket: cleanText(row[5] ?? ''),
  };
}

function isZerkosAbsenceCode(value: string): boolean {
  return /^[A-Z]{2,6}$/.test(cleanText(value).toUpperCase());
}

function isZerkosIgnoredRow(row: readonly string[]): boolean {
  const values = row.map((cell) => normalizeHeader(cell)).filter(Boolean);
  if (values.length === 0) {
    return true;
  }

  return ['total dias', 'ausenciarpt', 'zerkos', 'pagina'].includes(values[0]);
}

function hasAnyValue(row: RawAbsenceRow): boolean {
  return Object.values(row).some((value) => cleanText(value ?? ''));
}

function deduplicatePreviewRows(
  rows: readonly TicketRestaurantAbsencePreviewRow[],
): TicketRestaurantAbsencePreviewRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = buildExactKey(row);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildExactKey(row: TicketRestaurantAbsencePreviewRow): string {
  return [row.empleado, normalizeHeader(row.motivo), row.desde, row.hasta].join('|');
}

function buildAbsenceExactKey(absence: TicketRestaurantAbsence): string {
  return [absence.empleado, normalizeHeader(absence.motivo), absence.desde, absence.hasta].join(
    '|',
  );
}

function isOverlappingSameReason(
  absence: TicketRestaurantAbsence,
  row: TicketRestaurantAbsencePreviewRow,
): boolean {
  return (
    normalizeTicketEmployeeNumber(absence.empleado) === normalizeTicketEmployeeNumber(row.empleado) &&
    normalizeHeader(absence.motivo) === normalizeHeader(row.motivo) &&
    absence.desde <= row.hasta &&
    row.desde <= absence.hasta
  );
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
  if (!text) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && isIsoDate(text)) {
    return text;
  }

  const separated = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (separated) {
    const day = Number(separated[1]);
    const month = Number(separated[2]);
    const year = Number(separated[3].length === 2 ? `20${separated[3]}` : separated[3]);
    const iso = toIsoDate(year, month, day);
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

function normalizeTotalDays(value: unknown): string {
  const text = cleanText(value).replace(',', '.');
  if (!text) {
    return '';
  }

  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}

function calculateInclusiveDaysText(desde: string, hasta: string): string {
  if (!isIsoDate(desde) || !isIsoDate(hasta) || hasta < desde) {
    return '';
  }

  const start = Date.parse(`${desde}T00:00:00.000Z`);
  const end = Date.parse(`${hasta}T00:00:00.000Z`);
  return String(Math.floor((end - start) / 86_400_000) + 1);
}

function normalizeAfectaTicket(value: string | undefined, desde: string): boolean {
  const normalized = normalizeHeader(value ?? '');
  if (['si', 's', 'j'].includes(normalized)) {
    return true;
  }
  if (['no', 'n'].includes(normalized)) {
    return false;
  }
  return isIsoDate(desde) && desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}


