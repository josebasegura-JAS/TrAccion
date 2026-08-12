import type { Employee } from '../../plantilla/domain/employee';
import {
  normalizeTicketCalendarName,
  normalizeTicketEmployeeNumber,
  splitTicketPersonFullName,
  type TicketCalendar,
  type TicketPersonDraft,
} from './ticketRestaurante';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseDelimitedText } from '../../../shared/import/delimitedText';

type TabularRow = string[];

type TicketPeopleImportField =
  | 'empleado'
  | 'nombre'
  | 'apellido1'
  | 'apellido2'
  | 'dni'
  | 'puesto'
  | 'calendario'
  | 'estado';

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
  ['nombre', 'nombre'],
  ['apellido1', 'apellido1'],
  ['apellido 1', 'apellido1'],
  ['primer apellido', 'apellido1'],
  ['apellido2', 'apellido2'],
  ['apellido 2', 'apellido2'],
  ['segundo apellido', 'apellido2'],
  ['dni', 'dni'],
  ['nif', 'dni'],
  ['dni nif', 'dni'],
  ['puesto', 'puesto'],
  ['puesto nomina', 'puesto'],
  ['puesto organizativo', 'puesto'],
  ['calendario', 'calendario'],
  ['calendar', 'calendario'],
  ['estado', 'estado'],
  ['activo', 'estado'],
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
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    return {
      drafts: [],
      ignored: Math.max(0, rows.length - 1),
      missingEmployees: [],
      duplicateRows: 0,
    };
  }

  const headers = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  const fieldByColumn = headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null);
  const columnByField = new Map<TicketPeopleImportField, number>();
  fieldByColumn.forEach((field, index) => {
    if (field && !columnByField.has(field)) columnByField.set(field, index);
  });

  const empleadoColumn = columnByField.get('empleado') ?? -1;
  const calendarioColumn = columnByField.get('calendario') ?? -1;

  if (empleadoColumn < 0 || calendarioColumn < 0) {
    return { drafts: [], ignored: dataRows.length, missingEmployees: [], duplicateRows: 0 };
  }

  const employeesById = new Map(
    employees
      .filter((employee) => !employee.deletedAt)
      .map((employee) => [normalizeTicketEmployeeNumber(employee.empleado), employee]),
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

  const readField = (row: TabularRow, field: TicketPeopleImportField): string => {
    const column = columnByField.get(field);
    return column === undefined ? '' : cleanText(row[column] ?? '');
  };

  dataRows.forEach((row) => {
    const empleado = normalizeTicketEmployeeNumber(row[empleadoColumn] ?? '');
    const calendarName = cleanText(row[calendarioColumn] ?? '');

    if (!empleado || !calendarName) {
      if (row.some((value) => cleanText(value))) ignored += 1;
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

    const plantillaDraft = ticketPersonDraftFromEmployee(
      employee,
      calendarIdByName.get(normalizeTicketCalendarName(calendarName)) ?? '',
    );
    const importedNombre = readField(row, 'nombre');
    const importedApellido1 = readField(row, 'apellido1');
    const importedApellido2 = readField(row, 'apellido2');
    const importedDni = readField(row, 'dni');
    const importedPuesto = readField(row, 'puesto');
    const importedEstado = readField(row, 'estado');
    const nombre = columnByField.has('nombre') ? importedNombre : plantillaDraft.nombre;
    const apellido1 = columnByField.has('apellido1') ? importedApellido1 : plantillaDraft.apellido1;
    const apellido2 = columnByField.has('apellido2') ? importedApellido2 : plantillaDraft.apellido2;

    draftsByEmpleado.set(empleado, {
      ...plantillaDraft,
      nombre,
      apellido1,
      apellido2,
      dni: columnByField.has('dni') ? importedDni : plantillaDraft.dni,
      puesto: columnByField.has('puesto') ? importedPuesto : plantillaDraft.puesto,
      nombreApellidos:
        columnByField.has('nombre') ||
        columnByField.has('apellido1') ||
        columnByField.has('apellido2')
          ? [nombre, apellido1, apellido2].filter(Boolean).join(' ')
          : plantillaDraft.nombreApellidos,
      activo: columnByField.has('estado')
        ? parseActiveState(importedEstado)
        : plantillaDraft.activo,
      calendarName,
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

function findHeaderRowIndex(rows: TabularRow[]): number {
  const searchLimit = Math.min(rows.length, 20);
  for (let rowIndex = 0; rowIndex < searchLimit; rowIndex += 1) {
    const fields = (rows[rowIndex] ?? []).map(
      (header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null,
    );
    if (fields.includes('empleado') && fields.includes('calendario')) {
      return rowIndex;
    }
  }
  return -1;
}

function parseActiveState(value: string): boolean {
  const normalized = normalizeHeader(value);
  if (['inactivo', 'no', 'false', '0', 'baja'].includes(normalized)) return false;
  if (['activo', 'si', 'true', '1', 'alta'].includes(normalized)) return true;
  return true;
}


export function splitPlantillaEmployeeName(
  nombreApellidos: string,
): Pick<TicketPersonDraft, 'nombre' | 'apellido1' | 'apellido2'> {
  const cleaned = cleanText(nombreApellidos);
  if (!cleaned) {
    return { nombre: '', apellido1: '', apellido2: '' };
  }

  if (cleaned.includes(',')) {
    return splitTicketPersonFullName(cleaned);
  }

  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length === 1) {
    return { nombre: parts[0] ?? '', apellido1: '', apellido2: '' };
  }
  if (parts.length === 2) {
    return { nombre: parts[1] ?? '', apellido1: parts[0] ?? '', apellido2: '' };
  }

  // La fuente corporativa de Plantilla llega habitualmente como
  // "Apellido1 Apellido2 Nombre" cuando no incluye coma.
  return {
    nombre: parts.slice(2).join(' '),
    apellido1: parts[0] ?? '',
    apellido2: parts[1] ?? '',
  };
}

export function ticketPersonDraftFromEmployee(
  employee: Employee,
  calendarId = '',
): TicketPersonDraft {
  const splitName = splitPlantillaEmployeeName(employee.nombreApellidos);
  return {
    empleado: normalizeTicketEmployeeNumber(employee.empleado),
    nombre: splitName.nombre,
    apellido1: splitName.apellido1,
    apellido2: splitName.apellido2,
    dni: employee.dni || employee.nif || '',
    nombreApellidos: employee.nombreApellidos,
    puesto: employee.puestoNomina || employee.puestoOrganizativo,
    calendarId,
    activo: true,
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


function cleanText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
