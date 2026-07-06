import { EMPTY_EMPLOYEE_DRAFT, type EmployeeDraft, type EmployeeField } from './employee';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';

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

export async function importEmployeesFromFile(file: File): Promise<EmployeeDraft[]> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const text = new TextDecoder().decode(buffer);
    return rowsToEmployeeDrafts(parseDelimitedText(text));
  }

  return rowsToEmployeeDrafts(await parseXlsxRows(buffer));
}

export function rowsToEmployeeDrafts(rows: TabularRow[]): EmployeeDraft[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const fieldByColumn = headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null);

  const draftsByEmpleado = new Map<string, EmployeeDraft>();

  dataRows.forEach((row) => {
    const draft: EmployeeDraft = { ...EMPTY_EMPLOYEE_DRAFT };

    fieldByColumn.forEach((field, index) => {
      if (field) {
        draft[field] = normalizeEmployeeCellValue(field, row[index]?.trim() ?? '');
      }
    });

    const empleado = draft.empleado.trim();
    if (empleado) {
      draftsByEmpleado.set(empleado, draft);
    }
  });

  return Array.from(draftsByEmpleado.values());
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

