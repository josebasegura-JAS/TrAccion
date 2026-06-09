import { parseXlsxRows } from '../../plantilla/domain/importJobPositionTranslations';

export interface TeletrabajoPuesto {
  id: string;
  puesto: string;
  maxSolicitudes: number;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TeletrabajoPuestoDraft {
  puesto: string;
  maxSolicitudes: number;
  observaciones: string;
}

const PUESTO_HEADERS = new Set(['puesto', 'puesto teletrabajo', 'puesto teletrabajable']);
const MAX_HEADERS = new Set(['maximo', 'maximo solicitudes', 'max solicitudes', 'limite', 'limite solicitudes']);
const OBSERVACIONES_HEADERS = new Set(['observaciones', 'observacion', 'notas', 'nota']);

export const EMPTY_TELETRABAJO_PUESTO_DRAFT: TeletrabajoPuestoDraft = {
  puesto: '',
  maxSolicitudes: 1,
  observaciones: '',
};

export function normalizeTeletrabajoPuesto(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTeletrabajoPuestoDraft(
  draft: TeletrabajoPuestoDraft,
): TeletrabajoPuestoDraft {
  return {
    puesto: draft.puesto.trim(),
    maxSolicitudes: Number.isFinite(draft.maxSolicitudes)
      ? Math.max(1, Math.floor(draft.maxSolicitudes))
      : 1,
    observaciones: draft.observaciones.trim(),
  };
}

export async function importTeletrabajoPuestosFromFile(
  file: File,
): Promise<TeletrabajoPuestoDraft[]> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const rows = extension === 'xlsx' || extension === 'xls'
    ? await parseXlsxRows(await file.arrayBuffer())
    : parseDelimitedRows(await file.text(), extension === 'tsv' ? '\t' : undefined);

  return rowsToTeletrabajoPuestoDrafts(rows);
}

export function rowsToTeletrabajoPuestoDrafts(rows: string[][]): TeletrabajoPuestoDraft[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const puestoIndex = normalizedHeaders.findIndex((header) => PUESTO_HEADERS.has(header));
  const maxIndex = normalizedHeaders.findIndex((header) => MAX_HEADERS.has(header));
  const observacionesIndex = normalizedHeaders.findIndex((header) => OBSERVACIONES_HEADERS.has(header));

  if (puestoIndex < 0) {
    throw new Error('El fichero debe tener una columna Puesto. Opcionalmente puede incluir Máximo y Observaciones.');
  }

  const draftsByPuesto = new Map<string, TeletrabajoPuestoDraft>();

  dataRows.forEach((row) => {
    const puesto = row[puestoIndex]?.trim() ?? '';
    if (!puesto) {
      return;
    }

    const maxSolicitudes = maxIndex >= 0 ? Number(row[maxIndex]) : 1;
    const observaciones = observacionesIndex >= 0 ? row[observacionesIndex]?.trim() ?? '' : '';
    draftsByPuesto.set(normalizeTeletrabajoPuesto(puesto),
      normalizeTeletrabajoPuestoDraft({ puesto, maxSolicitudes, observaciones }),
    );
  });

  return Array.from(draftsByPuesto.values()).sort((first, second) =>
    first.puesto.localeCompare(second.puesto, 'es', { numeric: true, sensitivity: 'base' }),
  );
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
