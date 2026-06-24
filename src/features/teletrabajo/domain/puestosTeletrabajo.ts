import { parseXlsxRows } from '../../plantilla/domain/importJobPositionTranslations';

export interface TeletrabajoPuesto {
  id: string;
  puesto: string;
  maxSolicitudes: number;
  dotacionComputable: number;
  grupoCoberturaId: string | null;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeletrabajoPuestoDraft {
  puesto: string;
  maxSolicitudes: number;
  dotacionComputable: number;
  grupoCoberturaId: string | null;
  observaciones: string;
}

const PUESTO_HEADERS = new Set([
  'puesto',
  'puesto organizativo',
  'puesto teletrabajo',
  'puesto teletrabajable',
]);
const MAX_HEADERS = new Set([
  'maximo',
  'maximo solicitudes',
  'max solicitudes',
  'limite',
  'limite solicitudes',
  'presencialidad minima',
  'presencialidad minima de personas por puesto',
  'presencialidad minima de personas por puesto para el normal funcionamiento de la unidad puestos 2 o mas personas',
]);
const DOTACION_HEADERS = new Set(['dotacion', 'dotacion computable', 'personas', 'personas computables', 'numero personas', 'n personas']);
const GRUPO_COBERTURA_HEADERS = new Set(['grupo', 'grupo cobertura', 'grupo de cobertura', 'cobertura']);
const TELETRABAJO_HEADERS = new Set(['teletrabajo s/n', 'teletrabajo', 'teletrabajable']);
const OBSERVACIONES_HEADERS = new Set(['observaciones', 'observacion', 'notas', 'nota']);

export interface TeletrabajoPuestoImportRow {
  draft: TeletrabajoPuestoDraft;
  /** Nombre textual del grupo de cobertura tal como aparece en el fichero importado (sin resolver a id todavía). */
  grupoCoberturaNombre: string;
}

export const EMPTY_TELETRABAJO_PUESTO_DRAFT: TeletrabajoPuestoDraft = {
  puesto: '',
  maxSolicitudes: 0,
  dotacionComputable: 0,
  grupoCoberturaId: null,
  observaciones: '',
};

export function normalizeTeletrabajoPuesto(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTeletrabajoPuestoDraft(
  draft: Partial<TeletrabajoPuestoDraft>,
): TeletrabajoPuestoDraft {
  return {
    puesto: (draft.puesto ?? '').trim(),
    maxSolicitudes: normalizePresencialidadMinima(draft.maxSolicitudes ?? 0),
    dotacionComputable: normalizePresencialidadMinima(draft.dotacionComputable ?? 0),
    grupoCoberturaId: draft.grupoCoberturaId ?? null,
    observaciones: (draft.observaciones ?? '').trim(),
  };
}

export async function importTeletrabajoPuestosFromFile(
  file: File,
): Promise<TeletrabajoPuestoImportRow[]> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows = extension === 'xlsx' || extension === 'xls'
    ? await parseXlsxRows(await file.arrayBuffer())
    : parseDelimitedRows(await file.text(), extension === 'tsv' ? '\t' : undefined);

  return rowsToTeletrabajoPuestoDrafts(rows);
}

export function rowsToTeletrabajoPuestoDrafts(rows: string[][]): TeletrabajoPuestoImportRow[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const puestoIndex = normalizedHeaders.findIndex((header) => PUESTO_HEADERS.has(header));
  const maxIndex = normalizedHeaders.findIndex((header) => MAX_HEADERS.has(header));
  const dotacionIndex = normalizedHeaders.findIndex((header) => DOTACION_HEADERS.has(header));
  const grupoCoberturaIndex = normalizedHeaders.findIndex((header) => GRUPO_COBERTURA_HEADERS.has(header));
  const teletrabajoIndex = normalizedHeaders.findIndex((header) => TELETRABAJO_HEADERS.has(header));
  const observacionesIndex = normalizedHeaders.findIndex((header) => OBSERVACIONES_HEADERS.has(header));

  if (puestoIndex < 0) {
    throw new Error(
      'El fichero debe tener una columna Puesto Organizativo. Opcionalmente puede incluir Presencialidad mínima y Observaciones.',
    );
  }

  const rowsByPuesto = new Map<string, TeletrabajoPuestoImportRow>();

  dataRows.forEach((row) => {
    const puesto = row[puestoIndex]?.trim() ?? '';
    if (!puesto) {
      return;
    }

    if (teletrabajoIndex >= 0 && !isTeletrabajableValue(row[teletrabajoIndex] ?? '')) {
      return;
    }

    const maxSolicitudes = maxIndex >= 0 ? parsePresencialidadMinima(row[maxIndex]) : 0;
    const dotacionComputable = dotacionIndex >= 0 ? parsePresencialidadMinima(row[dotacionIndex]) : 0;
    const grupoCoberturaNombre = grupoCoberturaIndex >= 0 ? row[grupoCoberturaIndex]?.trim() ?? '' : '';
    const observaciones = observacionesIndex >= 0 ? row[observacionesIndex]?.trim() ?? '' : '';
    rowsByPuesto.set(normalizeTeletrabajoPuesto(puesto), {
      draft: normalizeTeletrabajoPuestoDraft({ puesto, maxSolicitudes, dotacionComputable, observaciones }),
      grupoCoberturaNombre,
    });
  });

  return Array.from(rowsByPuesto.values()).sort((first, second) =>
    first.draft.puesto.localeCompare(second.draft.puesto, 'es', { numeric: true, sensitivity: 'base' }),
  );
}


function normalizePresencialidadMinima(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function parsePresencialidadMinima(value: string | undefined): number {
  const normalized = (value ?? '').trim();
  if (!normalized || normalized === '-') {
    return 0;
  }

  const parsed = Number(normalized.replace(',', '.'));
  return normalizePresencialidadMinima(parsed);
}

function isTeletrabajableValue(value: string): boolean {
  const normalized = normalizeTeletrabajoPuesto(value);
  return normalized === 's' || normalized === 'si' || normalized === 'sí' || normalized === 'yes';
}

function normalizeHeader(value: string): string {
  return normalizeTeletrabajoPuesto(value);
}

function parseDelimitedRows(text: string, delimiter?: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const firstLine = normalized.split('\n').find((line) => line.trim().length > 0) ?? '';
  const detectedDelimiter = delimiter ?? (firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',');

  return normalized
    .split('\n')
    .map((line) => parseDelimitedLine(line, detectedDelimiter))
    .filter((row) => row.some((cell) => cell.trim().length > 0));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}
