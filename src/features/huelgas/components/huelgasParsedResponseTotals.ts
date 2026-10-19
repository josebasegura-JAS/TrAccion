import type {
  HuelgaGeneralDetail,
  HuelgaGeneralMetricValues,
  HuelgaGeneralShift,
  ParsedHuelgaResponse,
} from './huelgasResponseCollection';
import { parseHuelgaResponseWorkbook } from './huelgasResponseCollection';

function normalize(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInteger(value: string): number | null {
  const compact = value.replace(/\s+/g, '').replace(',', '.');
  if (!compact) return null;
  const parsed = Number(compact);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
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

function canonicalColectivo(value: string): string | null {
  const normalized = normalize(value);
  if (!normalized || normalized === 'total') return null;
  if (normalized.includes('conduccion')) return 'Conducción';
  if (normalized.includes('spve')) return 'SPVE';
  if (normalized.includes('material movil')) return 'Material Móvil';
  if (normalized === 'usi' || normalized.includes(' usi')) return 'USI';
  if (normalized.includes('jefat') && (normalized.includes('mto') || normalized.includes('ingenieria'))) {
    return 'Jefat. Mto. e Ingeniería';
  }
  if (normalized === 'oac' || normalized.includes('oac')) return 'OAC';
  if (normalized === 'scc') return 'SCC';
  if (normalized === 'eem') return 'EEM';
  if (normalized === 'via') return 'Vía';
  if (normalized.includes('catenaria')) return 'Catenaria';
  if (normalized === 'pmc') return 'PMC';
  if (normalized.includes('linea') || normalized.includes('auxiliares') || normalized.includes('jefes de operaciones')) {
    return 'Línea';
  }
  if (normalized.includes('gmo') || normalized.includes('oficinas')) return 'Oficinas (GMO)';
  return null;
}

const METRIC_ALIASES = {
  huelga: ['huelga', 'personas en huelga', 'personas que hacen huelga', 'personal en huelga', 'huelguistas'],
  trabajan: ['personas que trabajan', 'personal que trabaja', 'personas trabajando', 'trabajan'],
  personasTurno: ['personas con turno', 'personal con turno', 'personas turno', 'con turno'],
  serviciosMinimos: ['servicios minimos', 'servicio minimo', 'ssmm'],
} as const;

const AUTO_TOTAL_WARNINGS = new Set([
  'No se ha localizado automáticamente el total de personas con turno.',
  'No se ha localizado automáticamente el total de servicios mínimos.',
  'No se ha localizado automáticamente el total de personas que trabajan.',
  'No se ha localizado automáticamente el total de personas en huelga.',
].map(normalize));

type DetailMetric = keyof typeof METRIC_ALIASES;
type MetricPairs = Record<DetailMetric, HuelgaGeneralMetricValues>;

type SheetLike = {
  getCell: (row: number, column: number) => { text: string };
  actualColumnCount: number;
  actualRowCount: number;
  rowCount?: number;
};

/**
 * ExcelJS diferencia entre:
 * - rowCount: índice de la última fila utilizada;
 * - actualRowCount: número de filas no vacías.
 *
 * En plantillas con huecos entre bloques (p. ej. Noche en 1-7 y Jornada Cont.
 * en 11-17), actualRowCount puede ser 14 aunque la última fila real sea la 17.
 * Usarlo como límite de índice trunca el segundo bloque. Siempre tomamos el
 * mayor de ambos valores para recorrer posiciones reales de fila.
 */
function lastRowIndex(worksheet: SheetLike): number {
  return Math.max(worksheet.rowCount ?? 0, worksheet.actualRowCount ?? 0);
}

function metricKeyFromLabel(value: string): DetailMetric | null {
  const normalized = normalize(value);
  for (const [metric, aliases] of Object.entries(METRIC_ALIASES) as Array<[DetailMetric, readonly string[]]>) {
    if (aliases.some((alias) => normalized.includes(normalize(alias)))) return metric;
  }
  return null;
}

function emptyMetricPairs(): MetricPairs {
  return {
    huelga: { mujeres: 0, hombres: 0 },
    trabajan: { mujeres: 0, hombres: 0 },
    personasTurno: { mujeres: 0, hombres: 0 },
    serviciosMinimos: { mujeres: 0, hombres: 0 },
  };
}

function shiftInRow(worksheet: SheetLike, row: number): HuelgaGeneralShift | null {
  const maxColumns = Math.min(worksheet.actualColumnCount, 16);
  for (let column = 1; column <= maxColumns; column += 1) {
    const shift = shiftKey(worksheet.getCell(row, column).text);
    if (shift) return shift;
  }
  return null;
}

function readMetricsUntilNextShift(
  worksheet: SheetLike,
  genderRow: number,
  femaleColumn: number,
): MetricPairs {
  const result = emptyMetricPairs();
  const found = new Set<DetailMetric>();
  const maxRow = Math.min(lastRowIndex(worksheet), genderRow + 20);

  for (let row = genderRow + 1; row <= maxRow; row += 1) {
    if (shiftInRow(worksheet, row)) break;

    let metric: DetailMetric | null = null;
    for (let column = 1; column < femaleColumn && !metric; column += 1) {
      const text = worksheet.getCell(row, column).text;
      if (text) metric = metricKeyFromLabel(text);
    }
    if (!metric || found.has(metric)) continue;

    const mujeres = parseInteger(worksheet.getCell(row, femaleColumn).text);
    const hombres = parseInteger(worksheet.getCell(row, femaleColumn + 1).text);
    if (mujeres === null && hombres === null) continue;

    result[metric] = {
      mujeres: mujeres ?? 0,
      hombres: hombres ?? 0,
    };
    found.add(metric);

    if (found.size === 4) break;
  }

  return result;
}

async function extractRobustGeneralDetail(buffer: ArrayBuffer): Promise<HuelgaGeneralDetail[]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const result: HuelgaGeneralDetail[] = [];
  const byKey = new Map<string, HuelgaGeneralDetail>();

  for (const worksheet of workbook.worksheets) {
    let activeShift: HuelgaGeneralShift | null = null;
    const maxRows = Math.min(lastRowIndex(worksheet), 160);
    const maxColumns = Math.min(worksheet.actualColumnCount, 50);

    for (let row = 1; row <= maxRows; row += 1) {
      const rowShift = shiftInRow(worksheet, row);
      if (rowShift) {
        activeShift = rowShift;
        continue;
      }
      if (!activeShift) continue;

      for (let column = 1; column < maxColumns; column += 1) {
        const female = normalize(worksheet.getCell(row, column).text);
        const male = normalize(worksheet.getCell(row, column + 1).text);
        if (female !== 'mujeres' || male !== 'hombres') continue;

        const colectivo = canonicalColectivo(worksheet.getCell(row - 1, column).text);
        if (!colectivo) continue;

        const key = `${activeShift}::${colectivo}`;
        const metrics = readMetricsUntilNextShift(worksheet, row, column);
        const hasAnyMetric = Object.values(metrics).some((pair) => pair.mujeres > 0 || pair.hombres > 0);
        if (!hasAnyMetric) continue;

        // Mañana y Jornada Partida pueden aparecer en bloques independientes
        // del mismo colectivo. Ambos pertenecen al corte de mañana y se suman.
        const previous = byKey.get(key);
        if (previous) {
          for (const metric of ['huelga', 'trabajan', 'personasTurno', 'serviciosMinimos'] as const) {
            previous[metric].mujeres += metrics[metric].mujeres;
            previous[metric].hombres += metrics[metric].hombres;
          }
        } else {
          const detail: HuelgaGeneralDetail = {
            turno: activeShift,
            colectivo,
            huelga: metrics.huelga,
            trabajan: metrics.trabajan,
            personasTurno: metrics.personasTurno,
            serviciosMinimos: metrics.serviciosMinimos,
          };
          byKey.set(key, detail);
          result.push(detail);
        }
      }
    }
  }

  return result;
}

function pairTotal(pair: HuelgaGeneralMetricValues): number {
  return pair.mujeres + pair.hombres;
}

function richerPair(
  robust: HuelgaGeneralMetricValues,
  fallback: HuelgaGeneralMetricValues | undefined,
): HuelgaGeneralMetricValues {
  if (!fallback) return robust;
  // El lector robusto agrega los bloques independientes (p. ej. Mañana y
  // Jornada Partida). El lector antiguo puede ver sólo uno de ellos.
  // Comparar únicamente el total y escoger el mayor oculta discrepancias
  // y puede sustituir un desglose por sexo por otro incorrecto.
  // El fallback sólo es válido cuando el lector robusto no encontró ningún
  // valor en este concepto.
  return pairTotal(robust) === 0 ? fallback : robust;
}

function mergeGeneralDetail(
  robustDetail: HuelgaGeneralDetail[],
  fallbackDetail: HuelgaGeneralDetail[] | undefined,
): HuelgaGeneralDetail[] {
  if (robustDetail.length === 0) return fallbackDetail ?? [];
  if (!fallbackDetail?.length) return robustDetail;

  const fallbackByKey = new Map(
    fallbackDetail.map((row) => [`${row.turno}::${normalize(row.colectivo)}`, row] as const),
  );
  const robustKeys = new Set(robustDetail.map((row) => `${row.turno}::${normalize(row.colectivo)}`));

  const merged = robustDetail.map((row) => {
    const fallback = fallbackByKey.get(`${row.turno}::${normalize(row.colectivo)}`);
    if (!fallback) return row;
    return {
      ...row,
      huelga: richerPair(row.huelga, fallback.huelga),
      trabajan: richerPair(row.trabajan, fallback.trabajan),
      personasTurno: richerPair(row.personasTurno, fallback.personasTurno),
      serviciosMinimos: richerPair(row.serviciosMinimos, fallback.serviciosMinimos),
    };
  });

  for (const fallback of fallbackDetail) {
    const key = `${fallback.turno}::${normalize(fallback.colectivo)}`;
    if (!robustKeys.has(key)) merged.push(fallback);
  }

  return merged;
}

export function huelgaTotalsFromDetail(detail: HuelgaGeneralDetail[]) {
  const sum = (key: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') =>
    detail.reduce((total, row) => total + row[key].hombres + row[key].mujeres, 0);

  return {
    personasTurno: sum('personasTurno'),
    serviciosMinimos: sum('serviciosMinimos'),
    personasTrabajan: sum('trabajan'),
    personasHuelga: sum('huelga'),
  };
}

export function normalizeParsedHuelgaResponseTotals(parsed: ParsedHuelgaResponse): ParsedHuelgaResponse {
  if (!parsed.generalDetail?.length) return parsed;
  const totals = huelgaTotalsFromDetail(parsed.generalDetail);
  return {
    ...parsed,
    ...totals,
    // El parser base puede no encontrar una celda TOTAL aunque el detalle H/M sí
    // esté completo. Una vez reconstruidos los totales desde ese detalle, esos
    // avisos dejan de representar un dato ausente y no deben mostrarse al usuario.
    warnings: parsed.warnings.filter((warning) => !AUTO_TOTAL_WARNINGS.has(normalize(warning))),
  };
}

export async function parseHuelgaResponseWorkbookForImport(buffer: ArrayBuffer): Promise<ParsedHuelgaResponse> {
  const parsed = await parseHuelgaResponseWorkbook(buffer);
  const robustDetail = await extractRobustGeneralDetail(buffer);
  const generalDetail = mergeGeneralDetail(robustDetail, parsed.generalDetail);

  return normalizeParsedHuelgaResponseTotals({
    ...parsed,
    generalDetail,
  });
}
