import { EMPTY_EMPLOYEE_DRAFT, type EmployeeDraft, type EmployeeField } from './employee';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseDelimitedText } from '../../../shared/import/delimitedText';

type TabularRow = string[];

const HEADER_ALIASES: ReadonlyArray<readonly [EmployeeField, readonly string[]]> = [
  [
    'empleado',
    [
      'empleado',
      'nº empleado',
      'n empleado',
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
    ['nombreApellidos', 'nombre apellidos', 'nombre y apellidos', 'nombre completo', 'apellidos y nombre', 'persona'],
  ],
  ['puestoNomina', ['puestoNomina', 'puesto nomina', 'puesto nómina', 'puesto de nomina', 'puesto de nómina']],
  [
    'puestoOrganizativo',
    ['puestoOrganizativo', 'puesto organizativo', 'puesto org', 'puesto organización', 'puesto organizacion'],
  ],
  ['puestoEus', ['Puesto_EUS', 'puestoEus', 'puesto eus', 'puesto euskera', 'lanpostua']],
  ['residencia', ['residencia', 'centro', 'centro trabajo', 'centro de trabajo']],
  ['unidad', ['unidad', 'unidad organizativa corta', 'unidad rrhh']],
  ['nivelRetributivo', ['nivelRetributivo', 'nivel retributivo', 'nivel', 'grupo retributivo']],
  [
    'direccionOrganizativa',
    [
      'direccionOrganizativa',
      'direccion organizativa',
      'dirección organizativa',
      'direccion',
      'dirección',
      'area',
      'área',
      'departamento',
      'unidad organizativa',
    ],
  ],
  [
    'antiguedadPuesto',
    [
      'antiguedadPuesto',
      'antiguedad',
      'antigüedad',
      'antiguedad puesto',
      'antigüedad puesto',
      'antiguedad en el puesto',
      'antigüedad en el puesto',
      'fecha puesto',
      'fecha inicio puesto',
    ],
  ],
  ['sexo', ['sexo', 'género', 'genero']],
  ['calle', ['calle', 'domicilio', 'direccion postal', 'dirección postal', 'direccion particular', 'dirección particular']],
  ['numero', ['numero', 'número', 'num', 'nº', 'n']],
  ['piso', ['piso', 'planta', 'puerta']],
  ['codigoPostal', ['codigoPostal', 'codigo postal', 'código postal', 'cp', 'c.p.']],
  ['poblacion', ['poblacion', 'población', 'localidad', 'municipio']],
  ['provincia', ['provincia', 'territorio']],
  ['nif', ['nif', 'dni', 'documento', 'documento identidad']],
];

const FIELD_BY_HEADER = buildFieldByHeader();

function buildFieldByHeader(): Map<string, EmployeeField> {
  return new Map(
    HEADER_ALIASES.flatMap(([field, aliases]) =>
      aliases.map((alias): [string, EmployeeField] => [normalizeHeader(alias), field]),
    ),
  );
}

export interface EmployeeImportData {
  drafts: EmployeeDraft[];
  importedFields: EmployeeField[];
}

export interface EmployeeImportPreview {
  headers: string[];
  dataRows: TabularRow[];
  defaultMapping: Array<EmployeeField | null>;
  headerRowIndex: number;
  sourceRowCount: number;
}

export async function analyzeEmployeeImportFile(file: File): Promise<EmployeeImportPreview> {
  const rows = await readTabularRows(file);
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    throw new Error(
      'No se ha podido localizar una fila de cabeceras válida. Debe incluir una columna de Empleado y al menos otra columna reconocible.',
    );
  }

  const headers = rows[headerRowIndex] ?? [];
  const dataRows = rows.slice(headerRowIndex + 1);
  return {
    headers,
    dataRows,
    defaultMapping: headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null),
    headerRowIndex,
    sourceRowCount: dataRows.filter((row) => row.some((cell) => cell.trim())).length,
  };
}

export async function readEmployeeImportFromFile(
  file: File,
  columnMapping?: Array<EmployeeField | null>,
): Promise<EmployeeImportData> {
  const preview = await analyzeEmployeeImportFile(file);
  return previewToEmployeeImport(preview, columnMapping ?? preview.defaultMapping);
}

/**
 * API histórica usada por tests y otros consumidores: devuelve solo las filas.
 * El store usa readEmployeeImportFromFile para conocer además qué columnas
 * estaban realmente presentes y así no vaciar datos por columnas ausentes.
 */
export async function importEmployeesFromFile(file: File): Promise<EmployeeDraft[]> {
  return (await readEmployeeImportFromFile(file)).drafts;
}

export function rowsToEmployeeDrafts(rows: TabularRow[]): EmployeeDraft[] {
  return rowsToEmployeeImport(rows).drafts;
}

export function rowsToEmployeeImport(rows: TabularRow[]): EmployeeImportData {
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex < 0) {
    return { drafts: [], importedFields: [] };
  }

  const headers = rows[headerRowIndex] ?? [];
  const preview: EmployeeImportPreview = {
    headers,
    dataRows: rows.slice(headerRowIndex + 1),
    defaultMapping: headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null),
    headerRowIndex,
    sourceRowCount: rows.slice(headerRowIndex + 1).filter((row) => row.some((cell) => cell.trim())).length,
  };
  return previewToEmployeeImport(preview, preview.defaultMapping);
}

export function previewToEmployeeImport(
  preview: EmployeeImportPreview,
  columnMapping: Array<EmployeeField | null>,
): EmployeeImportData {
  const fieldByColumn = preview.headers.map((_, index) => columnMapping[index] ?? null);
  const importedFields = Array.from(
    new Set(fieldByColumn.filter((field): field is EmployeeField => field !== null)),
  );

  if (!importedFields.includes('empleado')) {
    return { drafts: [], importedFields };
  }

  const draftsByEmpleado = new Map<string, EmployeeDraft>();

  preview.dataRows.forEach((row) => {
    const draft: EmployeeDraft = { ...EMPTY_EMPLOYEE_DRAFT };

    fieldByColumn.forEach((field, index) => {
      if (field) {
        draft[field] = normalizeEmployeeCellValue(field, row[index]?.trim() ?? '');
      }
    });

    const empleado = draft.empleado.trim();
    if (empleado) {
      draft.empleado = empleado;
      draftsByEmpleado.set(empleado, draft);
    }
  });

  return { drafts: Array.from(draftsByEmpleado.values()), importedFields };
}

async function readTabularRows(file: File): Promise<TabularRow[]> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const text = new TextDecoder().decode(buffer);
    return parseDelimitedText(text, extension);
  }

  return parseXlsxRows(buffer);
}

/**
 * Algunos Excel corporativos incluyen una o varias filas de título antes de la
 * cabecera real. Buscamos la primera fila de las 15 iniciales que contenga
 * "Empleado" y al menos otra columna reconocible.
 */
function findHeaderRowIndex(rows: TabularRow[]): number {
  const limit = Math.min(rows.length, 15);
  for (let index = 0; index < limit; index += 1) {
    const recognized = (rows[index] ?? [])
      .map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null)
      .filter((field): field is EmployeeField => field !== null);
    if (recognized.includes('empleado') && new Set(recognized).size >= 2) {
      return index;
    }
  }

  return -1;
}

function normalizeEmployeeCellValue(field: EmployeeField, value: string): string {
  if (field !== 'antiguedadPuesto') {
    return value;
  }

  return normalizeExcelDateValue(value);
}

function normalizeExcelDateValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const dateMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dateMatch) {
    const [, day, month, year] = dateMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
      return date.toISOString().slice(0, 10);
    }
  }

  return trimmed;
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
