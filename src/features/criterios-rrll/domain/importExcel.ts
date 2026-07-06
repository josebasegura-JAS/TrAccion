import { EMPTY_CRITERIO_RRLL_DRAFT, type CriterioRrllDraft, type CriterioRrllDraftField } from './criterioRrll';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';
import { parseDelimitedText } from '../../../shared/import/delimitedText';

type TabularRow = string[];

export interface CriterioRrllImportPreviewRow {
  rowNumber: number;
  draft: CriterioRrllDraft;
}


const HEADER_ALIASES: ReadonlyArray<readonly [CriterioRrllDraftField, readonly string[]]> = [
  ['tema', ['tema', 'asunto', 'materia']],
  ['fecha', ['fecha', 'año', 'ano', 'ejercicio']],
  ['responsable', ['responsable', 'area', 'área', 'departamento']],
  ['criterio', ['criterio', 'descripcion', 'descripción', 'detalle', 'texto']],
  ['sentido', ['sentido', 'resultado', 'resolucion', 'resolución']],
  ['estado', ['estado']],
  ['observaciones', ['observaciones', 'observacion', 'observación', 'notas', 'nota']],
];

const FIELD_BY_HEADER = buildFieldByHeader();

function buildFieldByHeader(): Map<string, CriterioRrllDraftField> {
  return new Map(
    HEADER_ALIASES.flatMap(([field, aliases]) =>
      aliases.map((alias): [string, CriterioRrllDraftField] => [normalizeHeader(alias), field]),
    ),
  );
}

export async function importCriteriosRrllFromFile(file: File): Promise<CriterioRrllDraft[]> {
  const previewRows = await parseCriteriosRrllImportFile(file);
  return previewRows.map((row) => row.draft);
}

export async function parseCriteriosRrllImportFile(file: File): Promise<CriterioRrllImportPreviewRow[]> {
  const buffer = await file.arrayBuffer();
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const text = new TextDecoder().decode(buffer);
    return rowsToCriterioRrllImportPreviewRows(parseDelimitedText(text));
  }

  return rowsToCriterioRrllImportPreviewRows(await parseXlsxRows(buffer));
}

export function rowsToCriterioRrllDrafts(rows: TabularRow[]): CriterioRrllDraft[] {
  return rowsToCriterioRrllImportPreviewRows(rows).map((row) => row.draft);
}

export function rowsToCriterioRrllImportPreviewRows(rows: TabularRow[]): CriterioRrllImportPreviewRow[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const fieldByColumn = headers.map((header) => FIELD_BY_HEADER.get(normalizeHeader(header)) ?? null);
  const draftsByKey = new Map<string, CriterioRrllImportPreviewRow>();

  dataRows.forEach((row, rowIndex) => {
    const draft: CriterioRrllDraft = { ...EMPTY_CRITERIO_RRLL_DRAFT, estado: 'vigente' };

    fieldByColumn.forEach((field, index) => {
      if (!field) {
        return;
      }

      const value = normalizeCellValue(row[index] ?? '');
      if (field === 'estado') {
        draft.estado = value === 'archivado' || value === 'en revisión' ? value : 'vigente';
      } else if (field === 'sentido') {
        draft.sentido = normalizeSentido(value);
      } else {
        draft[field] = value;
      }
    });

    if (!draft.tema.trim() || !draft.criterio.trim()) {
      return;
    }

    draftsByKey.set(buildImportedCriterioKey(draft), { rowNumber: rowIndex + 2, draft });
  });

  return Array.from(draftsByKey.values());
}


export function buildImportedCriterioKey(draft: Pick<CriterioRrllDraft, 'tema' | 'fecha' | 'criterio'>): string {
  return [draft.tema, draft.fecha, draft.criterio].map(normalizeDuplicatePart).join('|');
}

function normalizeCellValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeSentido(value: string): CriterioRrllDraft['sentido'] {
  const normalized = normalizeDuplicatePart(value);

  if (['aprobado', 'aprobar', 'si', 'sí', 'favorable', 'concedido', 'aceptado'].includes(normalized)) {
    return 'aprobado';
  }

  if (['denegado', 'denegar', 'no', 'desfavorable', 'rechazado'].includes(normalized)) {
    return 'denegado';
  }

  return 'sin clasificar';
}

function normalizeDuplicatePart(value: string): string {
  return normalizeCellValue(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
