import type { Employee } from '../../plantilla/domain/employee';
import {
  normalizeTicketCalendarName,
  splitTicketPersonFullName,
  type TicketCalendar,
  type TicketPersonDraft,
} from './ticketRestaurante';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';

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

