import type { HuelgaGeneralDetail, HuelgaGeneralShift } from './huelgasResponseCollection';

export const HUELGAS_IMPORT_HISTORY_STORAGE_KEY = 'traccion.v1.huelgas.importaciones';

export type HuelgaImportBatch = {
  id: string;
  fileName: string;
  importedAt: string;
  blocks: Array<{ turno: HuelgaGeneralShift; colectivo: string }>;
  replacedBlocks: string[];
};

export type HuelgaImportHistory = Record<string, Record<string, HuelgaImportBatch[]>>;

function normalize(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalColectivo(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized || normalized === 'total') return null;
  if (normalized.includes('conduccion')) return 'Conducción';
  if (normalized.includes('spve')) return 'SPVE';
  if (normalized.includes('material movil')) return 'Material Móvil';
  if (normalized === 'usi' || normalized.includes(' usi')) return 'USI';
  if (normalized.includes('jefat') && (normalized.includes('mto') || normalized.includes('ingenieria'))) return 'Jefat. Mto. e Ingeniería';
  if (normalized === 'oac' || normalized.includes('oac')) return 'OAC';
  if (normalized === 'scc') return 'SCC';
  if (normalized === 'eem') return 'EEM';
  if (normalized === 'via') return 'Vía';
  if (normalized.includes('catenaria')) return 'Catenaria';
  if (normalized === 'pmc') return 'PMC';
  if (normalized.includes('linea') || normalized.includes('auxiliares') || normalized.includes('jefes de operaciones')) return 'Línea';
  if (normalized.includes('gmo') || normalized.includes('oficinas')) return 'Oficinas (GMO)';
  return null;
}

function shiftKey(value: string): HuelgaGeneralShift | null {
  const normalized = normalize(value);
  if (normalized.includes('noche')) return 'noche';
  if (normalized.includes('tarde')) return 'tarde';
  if (
    normalized.includes('manana') ||
    normalized.includes('jornada cont') ||
    normalized.includes('jornada intensiva') ||
    normalized.includes('jornada partida')
  ) return 'manana';
  return null;
}

function detailKey(detail: Pick<HuelgaGeneralDetail, 'turno' | 'colectivo'>): string {
  return `${detail.turno}::${detail.colectivo}`;
}

export function huelgaDetailKey(detail: Pick<HuelgaGeneralDetail, 'turno' | 'colectivo'>): string {
  return detailKey(detail);
}

export function blockLabel(key: string): string {
  const [turno, colectivo] = key.split('::');
  const shift = turno === 'noche' ? 'Noche' : turno === 'tarde' ? 'Tarde' : 'Mañana';
  return `${shift} · ${colectivo || 'Colectivo'}`;
}

function metricLabel(value: string): boolean {
  const normalized = normalize(value);
  return (
    normalized.includes('huelga') ||
    normalized.includes('paro') ||
    normalized.includes('trabajan') ||
    normalized.includes('personas con turno') ||
    normalized.includes('personal con turno') ||
    normalized.includes('servicios minimos') ||
    normalized.includes('servicio minimo') ||
    normalized.includes('ssmm')
  );
}

/**
 * Detecta bloques con datos escritos realmente en el Excel. Un 0 explícito cuenta como dato;
 * una celda vacía no. Esto evita convertir plantillas vacías en filas de ceros importadas.
 */
export async function detectHuelgaWorkbookContentKeys(buffer: ArrayBuffer): Promise<Set<string>> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const active = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    for (let row = 1; row <= Math.min(worksheet.actualRowCount, 140); row += 1) {
      for (let column = 1; column < Math.min(worksheet.actualColumnCount, 40); column += 1) {
        const female = normalize(worksheet.getCell(row, column).text);
        const male = normalize(worksheet.getCell(row, column + 1).text);
        if (female !== 'mujeres' || male !== 'hombres') continue;

        const colectivo = canonicalColectivo(worksheet.getCell(row - 1, column).text);
        if (!colectivo) continue;

        let turno: HuelgaGeneralShift | null = null;
        for (let previous = row - 2; previous >= Math.max(1, row - 7) && !turno; previous -= 1) {
          for (let scanColumn = 1; scanColumn <= Math.min(worksheet.actualColumnCount, 14); scanColumn += 1) {
            turno = shiftKey(worksheet.getCell(previous, scanColumn).text);
            if (turno) break;
          }
        }
        if (!turno) continue;

        let hasExplicitMetric = false;
        for (let metricRow = row + 1; metricRow <= Math.min(row + 8, worksheet.actualRowCount); metricRow += 1) {
          const label = worksheet.getCell(metricRow, 1).text;
          if (!metricLabel(label)) continue;
          const femaleValue = worksheet.getCell(metricRow, column).text.trim();
          const maleValue = worksheet.getCell(metricRow, column + 1).text.trim();
          if (femaleValue !== '' || maleValue !== '') {
            hasExplicitMetric = true;
            break;
          }
        }
        if (hasExplicitMetric) active.add(`${turno}::${colectivo}`);
      }
    }
  }

  return active;
}

export async function filterHuelgaDetailWithContent(
  buffer: ArrayBuffer,
  detail: HuelgaGeneralDetail[] | undefined,
): Promise<HuelgaGeneralDetail[]> {
  if (!detail?.length) return [];
  const active = await detectHuelgaWorkbookContentKeys(buffer);
  if (active.size === 0) {
    // Formatos especiales sin cabecera estándar: conservar solo filas con algún valor distinto de cero.
    return detail.filter((row) => [row.huelga, row.trabajan, row.personasTurno, row.serviciosMinimos]
      .some((metric) => metric.hombres !== 0 || metric.mujeres !== 0));
  }
  return detail.filter((row) => active.has(detailKey(row)));
}

export function findHuelgaImportConflicts(
  existing: HuelgaGeneralDetail[] | undefined,
  incoming: HuelgaGeneralDetail[],
): string[] {
  const current = new Set((existing ?? []).map(detailKey));
  return [...new Set(incoming.map(detailKey).filter((key) => current.has(key)))];
}

export function mergeHuelgaImportedDetail(
  existing: HuelgaGeneralDetail[] | undefined,
  incoming: HuelgaGeneralDetail[],
): HuelgaGeneralDetail[] {
  const incomingKeys = new Set(incoming.map(detailKey));
  return [
    ...(existing ?? []).filter((row) => !incomingKeys.has(detailKey(row))),
    ...incoming,
  ];
}

export function makeHuelgaImportBatch(
  fileName: string,
  importedAt: string,
  incoming: HuelgaGeneralDetail[],
  conflicts: string[],
): HuelgaImportBatch {
  return {
    id: `${importedAt}-${Math.random().toString(36).slice(2, 8)}`,
    fileName,
    importedAt,
    blocks: incoming.map((row) => ({ turno: row.turno, colectivo: row.colectivo })),
    replacedBlocks: conflicts,
  };
}

export function isHuelgaImportHistory(value: unknown): value is HuelgaImportHistory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((byZone) => {
    if (!byZone || typeof byZone !== 'object' || Array.isArray(byZone)) return false;
    return Object.values(byZone as Record<string, unknown>).every((batches) =>
      Array.isArray(batches) && batches.every((batch) => {
        if (!batch || typeof batch !== 'object') return false;
        const candidate = batch as Partial<HuelgaImportBatch>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.fileName === 'string' &&
          typeof candidate.importedAt === 'string' &&
          Array.isArray(candidate.blocks) &&
          candidate.blocks.every((block) => Boolean(block) && typeof block.colectivo === 'string' && ['noche', 'manana', 'tarde'].includes(block.turno)) &&
          Array.isArray(candidate.replacedBlocks) && candidate.replacedBlocks.every((item) => typeof item === 'string')
        );
      }),
    );
  });
}
