import { type JobPositionTranslation, normalizeJobPosition } from './jobPositionTranslation';
import { parseXlsxRows } from '../../../shared/import/xlsxParser';

type TabularRow = string[];

const CASTELLANO_HEADERS = new Set(['puesto']);
const EUSKERA_HEADERS = new Set(['lanpostua']);

export async function importJobPositionTranslationsFromFile(
  file: File,
): Promise<JobPositionTranslation[]> {
  const buffer = await file.arrayBuffer();
  const rows = await parseXlsxRows(buffer);
  return rowsToJobPositionTranslations(rows);
}

export function rowsToJobPositionTranslations(rows: TabularRow[]): JobPositionTranslation[] {
  const [headers, ...dataRows] = rows;
  if (!headers) {
    return [];
  }

  const normalizedHeaders = headers.map(normalizeHeader);
  const castellanoIndex = normalizedHeaders.findIndex((header) => CASTELLANO_HEADERS.has(header));
  const euskeraIndex = normalizedHeaders.findIndex((header) => EUSKERA_HEADERS.has(header));

  if (castellanoIndex < 0 || euskeraIndex < 0) {
    throw new Error('La Excel debe tener las columnas exactas Puesto y Lanpostua.');
  }

  const translationsByPuesto = new Map<string, JobPositionTranslation>();

  dataRows.forEach((row) => {
    const puestoCastellano = row[castellanoIndex]?.trim() ?? '';
    const puestoEuskera = row[euskeraIndex]?.trim() ?? '';

    if (!puestoCastellano || !puestoEuskera) {
      return;
    }

    translationsByPuesto.set(normalizeJobPosition(puestoCastellano), {
      puestoCastellano,
      puestoEuskera,
    });
  });

  return Array.from(translationsByPuesto.values()).sort((first, second) =>
    first.puestoCastellano.localeCompare(second.puestoCastellano, 'es', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}

function normalizeHeader(header: string): string {
  return header
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

