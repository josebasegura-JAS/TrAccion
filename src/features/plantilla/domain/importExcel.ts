import { EMPTY_EMPLOYEE_DRAFT, type EmployeeDraft, type EmployeeField } from './employee';

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

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
  ['nivelRetributivo', ['nivelRetributivo', 'nivel retributivo', 'nivel', 'grupo retributivo']],
  ['sexo', ['sexo', 'género', 'genero']],
  ['calle', ['calle', 'direccion', 'dirección', 'domicilio']],
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
        draft[field] = row[index]?.trim() ?? '';
      }
    });

    const empleado = draft.empleado.trim();
    if (empleado) {
      draftsByEmpleado.set(empleado, draft);
    }
  });

  return Array.from(draftsByEmpleado.values());
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

async function readZipText(buffer: ArrayBuffer, entries: ZipEntry[], name: string, decoder: TextDecoder): Promise<string> {
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
