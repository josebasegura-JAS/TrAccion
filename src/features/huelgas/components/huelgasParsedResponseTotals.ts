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

const METRIC_ALIASES = {
  huelga: ['huelga', 'personas en huelga', 'personas que hacen huelga', 'personal en huelga', 'huelguistas'],
  trabajan: ['personas que trabajan', 'personal que trabaja', 'personas trabajando', 'trabajan'],
  personasTurno: ['personas con turno', 'personal con turno', 'personas turno', 'con turno'],
  serviciosMinimos: ['servicios minimos', 'servicio minimo', 'ssmm'],
} as const;

type DetailMetric = keyof typeof METRIC_ALIASES;

type MetricPairs = Record<DetailMetric, HuelgaGeneralMetricValues>;

function matchesMetric(value: string, aliases: readonly string[]): boolean {
  const normalized = normalize(value);
  return aliases.some((alias) => normalized.includes(normalize(alias)));
}

function metricKeyFromLabel(value: string): DetailMetric | null {
  for (const [metric, aliases] of Object.entries(METRIC_ALIASES) as Array<[DetailMetric, readonly string[]]>) {
    if (matchesMetric(value, aliases)) return metric;
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

function readMetricPairs(
  worksheet: {
    getCell: (row: number, column: number) => { text: string };
    actualColumnCount: number;
    actualRowCount: number;
  },
  genderRow: number,
  femaleColumn: number,
): MetricPairs {
  const result = emptyMetricPairs();
  const found = new Set<DetailMetric>();
  const lastRow = Math.min(genderRow + 12, worksheet.actualRowCount);
  const lastLabelColumn = Math.min(Math.max(1, femaleColumn - 1), worksheet.actualColumnCount);

  for (let row = genderRow + 1; row <= lastRow; row += 1) {
    // Un bloque termina al llegar a una nueva cabecera H/M. Esto evita que una
    // métrica ausente en el bloque actual se complete accidentalmente con datos
    // del bloque siguiente.
    if (
      normalize(worksheet.getCell(row, femaleColumn).text) === 'mujeres' &&
      normalize(worksheet.getCell(row, femaleColumn + 1).text) === 'hombres'
    ) break;

    let metric: DetailMetric | null = null;
    for (let column = 1; column <= lastLabelColumn && !metric; column += 1) {
      const label = worksheet.getCell(row, column).text;
      if (label) metric = metricKeyFromLabel(label);
    }
    if (!metric || found.has(metric)) continue;

    const mujeres = parseInteger(worksheet.getCell(row, femaleColumn).text);
    const hombres = parseInteger(worksheet.getCell(row, femaleColumn + 1).text);

    // No damos por encontrada una métrica si la fila solo contiene el rótulo y
    // ambos valores están realmente vacíos. Así podemos seguir buscando dentro
    // del mismo bloque sin convertir un falso positivo en ceros definitivos.
    if (mujeres === null && hombres === null) continue;

    result[metric] = {
      mujeres: mujeres ?? 0,
      hombres: hombres ?? 0,
    };
    found.add(metric);

    if (found.size === Object.keys(METRIC_ALIASES).length) break;
  }

  return result;
}

async function extractRobustGeneralDetail(buffer: ArrayBuffer): Promise<HuelgaGeneralDetail[]> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const result: HuelgaGeneralDetail[] = [];
  const seen = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    for (let row = 1; row <= Math.min(worksheet.actualRowCount, 160); row += 1) {
      for (let column = 1; column < Math.min(worksheet.actualColumnCount, 50); column += 1) {
        if (
          normalize(worksheet.getCell(row, column).text) !== 'mujeres' ||
          normalize(worksheet.getCell(row, column + 1).text) !== 'hombres'
        ) continue;

        const colectivo = canonicalColectivo(worksheet.getCell(row - 1, column).text);
        if (!colectivo) continue;

        let turno: HuelgaGeneralShift | null = null;
        for (let previous = row - 2; previous >= Math.max(1, row - 8) && !turno; previous -= 1) {
          for (let scanColumn = 1; scanColumn <= Math.min(worksheet.actualColumnCount, 16); scanColumn += 1) {
            turno = shiftKey(worksheet.getCell(previous, scanColumn).text);
            if (turno) break;
          }
        }
        if (!turno) continue;

        const key = `${turno}::${colectivo}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const metrics = readMetricPairs(worksheet, row, column);
        result.push({
          turno,
          colectivo,
          huelga: metrics.huelga,
          trabajan: metrics.trabajan,
          personasTurno: metrics.personasTurno,
          serviciosMinimos: metrics.serviciosMinimos,
        });
      }
    }
  }

  return result;
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

  return {
    ...parsed,
    ...huelgaTotalsFromDetail(parsed.generalDetail),
  };
}

export async function parseHuelgaResponseWorkbookForImport(buffer: ArrayBuffer): Promise<ParsedHuelgaResponse> {
  const parsed = await parseHuelgaResponseWorkbook(buffer);
  const robustDetail = await extractRobustGeneralDetail(buffer);
  const generalDetail = robustDetail.length > 0 ? robustDetail : parsed.generalDetail;

  return normalizeParsedHuelgaResponseTotals({
    ...parsed,
    generalDetail,
  });
}
