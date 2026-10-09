import huelgaMasterSeguimientoTemplate from './huelgaMasterSeguimientoTemplate';

export const HUELGAS_RESPONSE_STORAGE_KEY = 'traccion.v1.huelgas.recogidas';

export type HuelgaStrikePerson = {
  empleado: string;
  nombre: string;
};

export type HuelgaGeneralShift = 'noche' | 'manana' | 'tarde';

export type HuelgaGeneralMetricValues = {
  mujeres: number;
  hombres: number;
};

export type HuelgaGeneralDetail = {
  turno: HuelgaGeneralShift;
  colectivo: string;
  huelga: HuelgaGeneralMetricValues;
  trabajan: HuelgaGeneralMetricValues;
  personasTurno: HuelgaGeneralMetricValues;
  serviciosMinimos: HuelgaGeneralMetricValues;
};

export type HuelgaZoneResponse = {
  zonaId: string;
  zonaNombre: string;
  sourceFileName: string;
  importedAt: string | null;
  personasTurno: number | null;
  serviciosMinimos: number | null;
  personasTrabajan: number | null;
  personasHuelga: number | null;
  huelguistas: HuelgaStrikePerson[];
  observaciones: string;
  reviewed: boolean;
  warnings: string[];
  generalDetail?: HuelgaGeneralDetail[];
};

export type HuelgaResponseCollection = {
  huelgaId: string;
  responses: Record<string, HuelgaZoneResponse>;
  updatedAt: string;
};

export type HuelgaResponseCollections = Record<string, HuelgaResponseCollection>;

export type ParsedHuelgaResponse = Pick<
  HuelgaZoneResponse,
  'personasTurno' | 'serviciosMinimos' | 'personasTrabajan' | 'personasHuelga' | 'huelguistas' | 'warnings' | 'generalDetail'
>;

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isStrikePerson(value: unknown): value is HuelgaStrikePerson {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaStrikePerson>;
  return typeof candidate.empleado === 'string' && typeof candidate.nombre === 'string';
}

function isGeneralMetricValues(value: unknown): value is HuelgaGeneralMetricValues {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaGeneralMetricValues>;
  return (
    typeof candidate.mujeres === 'number' &&
    Number.isFinite(candidate.mujeres) &&
    candidate.mujeres >= 0 &&
    typeof candidate.hombres === 'number' &&
    Number.isFinite(candidate.hombres) &&
    candidate.hombres >= 0
  );
}

function isGeneralDetail(value: unknown): value is HuelgaGeneralDetail {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaGeneralDetail>;
  return (
    (candidate.turno === 'noche' || candidate.turno === 'manana' || candidate.turno === 'tarde') &&
    typeof candidate.colectivo === 'string' &&
    isGeneralMetricValues(candidate.huelga) &&
    isGeneralMetricValues(candidate.trabajan) &&
    isGeneralMetricValues(candidate.personasTurno) &&
    isGeneralMetricValues(candidate.serviciosMinimos)
  );
}

export function isHuelgaZoneResponse(value: unknown): value is HuelgaZoneResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaZoneResponse>;
  return (
    typeof candidate.zonaId === 'string' &&
    typeof candidate.zonaNombre === 'string' &&
    typeof candidate.sourceFileName === 'string' &&
    (candidate.importedAt === null || typeof candidate.importedAt === 'string') &&
    isNullableNumber(candidate.personasTurno) &&
    isNullableNumber(candidate.serviciosMinimos) &&
    isNullableNumber(candidate.personasTrabajan) &&
    isNullableNumber(candidate.personasHuelga) &&
    Array.isArray(candidate.huelguistas) && candidate.huelguistas.every(isStrikePerson) &&
    typeof candidate.observaciones === 'string' &&
    typeof candidate.reviewed === 'boolean' &&
    Array.isArray(candidate.warnings) && candidate.warnings.every((item) => typeof item === 'string') &&
    (
      typeof candidate.generalDetail === 'undefined' ||
      (Array.isArray(candidate.generalDetail) && candidate.generalDetail.every(isGeneralDetail))
    )
  );
}

export function isHuelgaResponseCollections(value: unknown): value is HuelgaResponseCollections {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(([huelgaId, record]) => {
    if (!record || typeof record !== 'object') return false;
    const candidate = record as Partial<HuelgaResponseCollection>;
    return (
      candidate.huelgaId === huelgaId &&
      typeof candidate.updatedAt === 'string' &&
      Boolean(candidate.responses) &&
      typeof candidate.responses === 'object' &&
      !Array.isArray(candidate.responses) &&
      Object.values(candidate.responses as Record<string, unknown>).every(isHuelgaZoneResponse)
    );
  });
}

export function emptyZoneResponse(zonaId: string, zonaNombre: string): HuelgaZoneResponse {
  return {
    zonaId,
    zonaNombre,
    sourceFileName: '',
    importedAt: null,
    personasTurno: null,
    serviciosMinimos: null,
    personasTrabajan: null,
    personasHuelga: null,
    huelguistas: [],
    observaciones: '',
    reviewed: false,
    warnings: [],
    generalDetail: [],
  };
}

export function responseHasData(response: HuelgaZoneResponse | undefined): boolean {
  if (!response) return false;
  return Boolean(
    response.sourceFileName ||
    response.importedAt ||
    response.personasTurno !== null ||
    response.serviciosMinimos !== null ||
    response.personasTrabajan !== null ||
    response.personasHuelga !== null ||
    response.huelguistas.length > 0 ||
    response.observaciones.trim(),
  );
}

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

function includesAny(value: string, aliases: string[]): boolean {
  const normalized = normalize(value);
  return aliases.some((alias) => normalized.includes(alias));
}

const LABEL_ALIASES = {
  turno: ['personas con turno', 'personal con turno', 'personas turno', 'con turno'],
  minimos: ['servicios minimos', 'servicio minimo', 'servicios mínimos', 'servicio mínimo', 'ssmm'],
  trabajan: ['personas que trabajan', 'personal que trabaja', 'personas trabajando', 'trabajan'],
  huelga: ['personas en huelga', 'personas que hacen huelga', 'personal en huelga', 'huelguistas'],
};

const HEADER_ALIASES = {
  empleado: ['nº empleado', 'n° empleado', 'no empleado', 'numero empleado', 'número empleado', 'empleado'],
  nombre: ['nombre y apellidos', 'nombre apellidos', 'nombre'],
  minimo: ['servicio minimo', 'servicio mínimo', 'servicios minimos', 'servicios mínimos', 'ssmm'],
  situacion: ['situacion', 'situación', 'estado'],
  observaciones: ['observaciones', 'observacion', 'observación'],
};

function findHeaderIndex(texts: string[], aliases: string[]): number {
  return texts.findIndex((text) => aliases.some((alias) => normalize(text) === normalize(alias)));
}

function nextNumericValue(
  sheet: { getCell: (row: number, column: number) => { text: string }; actualColumnCount: number; actualRowCount: number },
  row: number,
  column: number,
): number | null {
  for (let offset = 1; offset <= 5; offset += 1) {
    if (column + offset <= sheet.actualColumnCount) {
      const parsed = parseInteger(sheet.getCell(row, column + offset).text);
      if (parsed !== null) return parsed;
    }
  }
  for (let rowOffset = 1; rowOffset <= 2; rowOffset += 1) {
    if (row + rowOffset > sheet.actualRowCount) break;
    for (let columnOffset = 0; columnOffset <= 2; columnOffset += 1) {
      if (column + columnOffset > sheet.actualColumnCount) break;
      const parsed = parseInteger(sheet.getCell(row + rowOffset, column + columnOffset).text);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function scanLabelMetric(
  sheet: { getCell: (row: number, column: number) => { text: string }; actualColumnCount: number; actualRowCount: number },
  aliases: string[],
): number | null {
  for (let row = 1; row <= Math.min(sheet.actualRowCount, 120); row += 1) {
    for (let column = 1; column <= Math.min(sheet.actualColumnCount, 40); column += 1) {
      const text = sheet.getCell(row, column).text;
      if (!text || !includesAny(text, aliases)) continue;
      const value = nextNumericValue(sheet, row, column);
      if (value !== null) return value;
    }
  }
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

function metricPair(
  worksheet: { getCell: (row: number, column: number) => { text: string }; actualRowCount: number },
  genderRow: number,
  femaleColumn: number,
  aliases: string[],
): HuelgaGeneralMetricValues {
  for (let row = genderRow + 1; row <= Math.min(genderRow + 7, worksheet.actualRowCount); row += 1) {
    const label = worksheet.getCell(row, 1).text;
    if (!label || !includesAny(label, aliases)) continue;
    return {
      mujeres: parseInteger(worksheet.getCell(row, femaleColumn).text) ?? 0,
      hombres: parseInteger(worksheet.getCell(row, femaleColumn + 1).text) ?? 0,
    };
  }
  return { mujeres: 0, hombres: 0 };
}

function extractSsggDetail(
  worksheet: {
    getCell: (row: number, column: number) => { text: string };
    actualColumnCount: number;
    actualRowCount: number;
  },
): HuelgaGeneralDetail[] {
  const a1 = normalize(worksheet.getCell(1, 1).text);
  const b1 = normalize(worksheet.getCell(1, 2).text);
  if (!(a1.includes('n') && b1.includes('nombre'))) return [];

  for (let column = 1; column <= Math.min(worksheet.actualColumnCount, 30); column += 1) {
    const title = canonicalColectivo(worksheet.getCell(2, column).text);
    if (title !== 'Oficinas (GMO)') continue;
    const female = normalize(worksheet.getCell(3, column).text);
    const male = normalize(worksheet.getCell(3, column + 1).text);
    if (female !== 'mujeres' || male !== 'hombres') continue;
    return [{
      turno: 'manana',
      colectivo: 'Oficinas (GMO)',
      huelga: {
        mujeres: parseInteger(worksheet.getCell(4, column).text) ?? 0,
        hombres: parseInteger(worksheet.getCell(4, column + 1).text) ?? 0,
      },
      trabajan: {
        mujeres: parseInteger(worksheet.getCell(5, column).text) ?? 0,
        hombres: parseInteger(worksheet.getCell(5, column + 1).text) ?? 0,
      },
      personasTurno: {
        mujeres: parseInteger(worksheet.getCell(6, column).text) ?? 0,
        hombres: parseInteger(worksheet.getCell(6, column + 1).text) ?? 0,
      },
      serviciosMinimos: {
        mujeres: parseInteger(worksheet.getCell(7, column).text) ?? 0,
        hombres: parseInteger(worksheet.getCell(7, column + 1).text) ?? 0,
      },
    }];
  }
  return [];
}

function extractGeneralDetail(
  workbook: {
    worksheets: Array<{
      name: string;
      getCell: (row: number, column: number) => { text: string };
      actualColumnCount: number;
      actualRowCount: number;
    }>;
  },
): HuelgaGeneralDetail[] {
  const result: HuelgaGeneralDetail[] = [];

  for (const worksheet of workbook.worksheets) {
    const ssgg = extractSsggDetail(worksheet);
    if (ssgg.length > 0) {
      result.push(...ssgg);
      continue;
    }

    for (let row = 1; row <= Math.min(worksheet.actualRowCount, 120); row += 1) {
      for (let column = 1; column < Math.min(worksheet.actualColumnCount, 40); column += 1) {
        const femaleHeader = normalize(worksheet.getCell(row, column).text);
        const maleHeader = normalize(worksheet.getCell(row, column + 1).text);
        if (femaleHeader !== 'mujeres' || maleHeader !== 'hombres') continue;

        const colectivo = canonicalColectivo(worksheet.getCell(row - 1, column).text);
        if (!colectivo) continue;

        let turno: HuelgaGeneralShift | null = null;
        for (let previous = row - 2; previous >= Math.max(1, row - 6) && !turno; previous -= 1) {
          for (let scanColumn = 1; scanColumn <= Math.min(worksheet.actualColumnCount, 12); scanColumn += 1) {
            turno = shiftKey(worksheet.getCell(previous, scanColumn).text);
            if (turno) break;
          }
        }
        if (!turno) continue;

        result.push({
          turno,
          colectivo,
          huelga: metricPair(worksheet, row, column, LABEL_ALIASES.huelga),
          trabajan: metricPair(worksheet, row, column, LABEL_ALIASES.trabajan),
          personasTurno: metricPair(worksheet, row, column, LABEL_ALIASES.turno),
          serviciosMinimos: metricPair(worksheet, row, column, LABEL_ALIASES.minimos),
        });
      }
    }
  }

  return result;
}

export async function parseHuelgaResponseWorkbook(buffer: ArrayBuffer): Promise<ParsedHuelgaResponse> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let tableTurno: number | null = null;
  let tableMinimos: number | null = null;
  let tableTrabajan: number | null = null;
  let tableHuelga: number | null = null;
  const huelguistas: HuelgaStrikePerson[] = [];
  let metricTurno: number | null = null;
  let metricMinimos: number | null = null;
  let metricTrabajan: number | null = null;
  let metricHuelga: number | null = null;

  for (const worksheet of workbook.worksheets) {
    metricTurno ??= scanLabelMetric(worksheet, LABEL_ALIASES.turno);
    metricMinimos ??= scanLabelMetric(worksheet, LABEL_ALIASES.minimos);
    metricTrabajan ??= scanLabelMetric(worksheet, LABEL_ALIASES.trabajan);
    metricHuelga ??= scanLabelMetric(worksheet, LABEL_ALIASES.huelga);

    for (let row = 1; row <= Math.min(worksheet.actualRowCount, 100); row += 1) {
      const texts = Array.from({ length: Math.min(worksheet.actualColumnCount, 40) }, (_, index) =>
        worksheet.getCell(row, index + 1).text,
      );
      const employeeIndex = findHeaderIndex(texts, HEADER_ALIASES.empleado);
      const nameIndex = findHeaderIndex(texts, HEADER_ALIASES.nombre);
      const minimumIndex = findHeaderIndex(texts, HEADER_ALIASES.minimo);
      const situationIndex = findHeaderIndex(texts, HEADER_ALIASES.situacion);
      if (nameIndex < 0 || (employeeIndex < 0 && situationIndex < 0 && minimumIndex < 0)) continue;

      const isStrikeSheet = normalize(worksheet.name).includes('huelg');
      let totalRows = 0;
      let minRows = 0;
      let workRows = 0;
      let strikeRows = 0;
      let rowsWithMinimumValue = 0;
      let rowsWithSituationValue = 0;
      let consecutiveBlankRows = 0;

      for (let dataRow = row + 1; dataRow <= worksheet.actualRowCount; dataRow += 1) {
        const employee = employeeIndex >= 0 ? worksheet.getCell(dataRow, employeeIndex + 1).text.trim() : '';
        const name = worksheet.getCell(dataRow, nameIndex + 1).text.trim();
        const minimum = minimumIndex >= 0 ? normalize(worksheet.getCell(dataRow, minimumIndex + 1).text) : '';
        const situation = situationIndex >= 0 ? normalize(worksheet.getCell(dataRow, situationIndex + 1).text) : '';

        if (!employee && !name && !minimum && !situation) {
          consecutiveBlankRows += 1;
          if (consecutiveBlankRows >= 3) break;
          continue;
        }
        consecutiveBlankRows = 0;
        if (!employee && !name) continue;

        totalRows += 1;
        const isMinimum = /^(si|sí|s|x|1)$/i.test(minimum) || minimum.includes('minimo');
        const isStrike =
          (situation.includes('huelga') && !situation.startsWith('no huelga')) ||
          (isStrikeSheet && situation !== 'trabaja' && !situation.startsWith('no huelga'));
        const isWorking = situation.includes('trabaja') || situation.includes('trabajo');
        if (minimum) rowsWithMinimumValue += 1;
        if (situation) rowsWithSituationValue += 1;
        if (isMinimum) minRows += 1;
        if (isStrike) strikeRows += 1;
        if (isWorking && !isMinimum) workRows += 1;
        if (isStrike && name) huelguistas.push({ empleado: employee, nombre: name });
      }

      if (totalRows > 0) {
        tableTurno = Math.max(tableTurno ?? 0, totalRows);
        if (rowsWithMinimumValue > 0) tableMinimos = Math.max(tableMinimos ?? 0, minRows);
        if (rowsWithSituationValue > 0 || isStrikeSheet) {
          tableHuelga = Math.max(tableHuelga ?? 0, strikeRows);
          if (rowsWithSituationValue > 0) tableTrabajan = Math.max(tableTrabajan ?? 0, workRows);
        }
      }
    }
  }

  const uniqueHuelguistas = [...new Map(
    huelguistas.map((person) => [`${normalize(person.empleado)}::${normalize(person.nombre)}`, person]),
  ).values()];

  const generalDetail = extractGeneralDetail(workbook);
  const personasTurno = metricTurno ?? tableTurno;
  const serviciosMinimos = metricMinimos ?? tableMinimos;
  const personasTrabajan = metricTrabajan ?? tableTrabajan;
  const personasHuelga = metricHuelga ?? (uniqueHuelguistas.length > 0 ? uniqueHuelguistas.length : tableHuelga);
  const warnings: string[] = [];
  if (personasTurno === null) warnings.push('No se ha localizado automáticamente el total de personas con turno.');
  if (serviciosMinimos === null) warnings.push('No se ha localizado automáticamente el total de servicios mínimos.');
  if (personasTrabajan === null) warnings.push('No se ha localizado automáticamente el total de personas que trabajan.');
  if (personasHuelga === null) warnings.push('No se ha localizado automáticamente el total de personas en huelga.');

  return {
    personasTurno,
    serviciosMinimos,
    personasTrabajan,
    personasHuelga,
    huelguistas: uniqueHuelguistas,
    warnings,
    generalDetail,
  };
}

export function validateZoneResponse(response: HuelgaZoneResponse): string[] {
  const warnings: string[] = [];
  if (response.personasTurno === null) warnings.push('Falta personas con turno.');
  if (response.serviciosMinimos === null) warnings.push('Falta servicios mínimos.');
  if (response.personasTrabajan === null) warnings.push('Falta personas que trabajan.');
  if (response.personasHuelga === null) warnings.push('Falta personas en huelga.');
  if (
    response.personasTurno !== null &&
    response.serviciosMinimos !== null &&
    response.personasTrabajan !== null &&
    response.personasHuelga !== null &&
    response.serviciosMinimos + response.personasTrabajan + response.personasHuelga > response.personasTurno
  ) {
    warnings.push('La suma de servicios mínimos, trabajan y huelga supera las personas con turno.');
  }
  return warnings;
}

export function collectionTotals(responses: HuelgaZoneResponse[]) {
  const sum = (selector: (response: HuelgaZoneResponse) => number | null) =>
    responses.reduce((total, response) => total + (selector(response) ?? 0), 0);
  return {
    personasTurno: sum((response) => response.personasTurno),
    serviciosMinimos: sum((response) => response.serviciosMinimos),
    personasTrabajan: sum((response) => response.personasTrabajan),
    personasHuelga: sum((response) => response.personasHuelga),
  };
}

function masterTemplateToArrayBuffer(): ArrayBuffer {
  const binary = atob(huelgaMasterSeguimientoTemplate);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

const MASTER_COLUMNS: Record<string, [number, number]> = {
  'Conducción': [2, 3],
  SPVE: [4, 5],
  'Material Móvil': [6, 7],
  USI: [8, 9],
  'Jefat. Mto. e Ingeniería': [10, 11],
  OAC: [12, 13],
  SCC: [14, 15],
  EEM: [16, 17],
  'Vía': [18, 19],
  Catenaria: [20, 21],
  'Oficinas (GMO)': [22, 23],
  PMC: [24, 25],
  Línea: [26, 27],
};

const MASTER_ROWS: Record<HuelgaGeneralShift, {
  huelga: number;
  trabajan: number;
  personasTurno: number;
  serviciosMinimos: number;
  porcentajeSexo: number;
  porcentajeColectivo: number;
}> = {
  noche: {
    huelga: 5,
    trabajan: 6,
    personasTurno: 7,
    serviciosMinimos: 8,
    porcentajeSexo: 9,
    porcentajeColectivo: 10,
  },
  manana: {
    huelga: 15,
    trabajan: 16,
    personasTurno: 17,
    serviciosMinimos: 18,
    porcentajeSexo: 19,
    porcentajeColectivo: 20,
  },
  tarde: {
    huelga: 25,
    trabajan: 26,
    personasTurno: 27,
    serviciosMinimos: 28,
    porcentajeSexo: 29,
    porcentajeColectivo: 30,
  },
};

function emptyMetricValues(): HuelgaGeneralMetricValues {
  return { mujeres: 0, hombres: 0 };
}

function emptyDetail(turno: HuelgaGeneralShift, colectivo: string): HuelgaGeneralDetail {
  return {
    turno,
    colectivo,
    huelga: emptyMetricValues(),
    trabajan: emptyMetricValues(),
    personasTurno: emptyMetricValues(),
    serviciosMinimos: emptyMetricValues(),
  };
}

function sumMetric(
  target: HuelgaGeneralMetricValues,
  source: HuelgaGeneralMetricValues,
): HuelgaGeneralMetricValues {
  return {
    mujeres: target.mujeres + source.mujeres,
    hombres: target.hombres + source.hombres,
  };
}

function mergeDetail(target: HuelgaGeneralDetail, source: HuelgaGeneralDetail): HuelgaGeneralDetail {
  return {
    ...target,
    huelga: sumMetric(target.huelga, source.huelga),
    trabajan: sumMetric(target.trabajan, source.trabajan),
    personasTurno: sumMetric(target.personasTurno, source.personasTurno),
    serviciosMinimos: sumMetric(target.serviciosMinimos, source.serviciosMinimos),
  };
}

function aggregateGeneralDetails(responses: HuelgaZoneResponse[]) {
  const aggregated = new Map<string, HuelgaGeneralDetail>();
  const ssggOverrides: HuelgaGeneralDetail[] = [];

  for (const response of responses) {
    const details = response.generalDetail ?? [];
    const isSsgg = normalize(response.zonaNombre).includes('servicios generales');
    for (const detail of details) {
      if (isSsgg && detail.colectivo === 'Oficinas (GMO)') {
        ssggOverrides.push(detail);
        continue;
      }
      const key = `${detail.turno}::${detail.colectivo}`;
      const current = aggregated.get(key) ?? emptyDetail(detail.turno, detail.colectivo);
      aggregated.set(key, mergeDetail(current, detail));
    }
  }

  for (const detail of ssggOverrides) {
    aggregated.set(`${detail.turno}::${detail.colectivo}`, detail);
  }

  return aggregated;
}

function excelColumnName(column: number): string {
  let current = column;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function setTotalFormula(sheet: {
  getCell: (row: number, column: number) => { value: unknown };
}, row: number) {
  const femaleColumns = Object.values(MASTER_COLUMNS).map(([female]) => excelColumnName(female));
  const maleColumns = Object.values(MASTER_COLUMNS).map(([, male]) => excelColumnName(male));
  sheet.getCell(row, 28).value = { formula: `SUM(${femaleColumns.map((column) => `${column}${row}`).join(',')})` };
  sheet.getCell(row, 29).value = { formula: `SUM(${maleColumns.map((column) => `${column}${row}`).join(',')})` };
}

function writePercentFormulas(
  sheet: { getCell: (row: number, column: number) => { value: unknown } },
  rows: typeof MASTER_ROWS[HuelgaGeneralShift],
) {
  for (const [femaleColumn, maleColumn] of Object.values(MASTER_COLUMNS)) {
    const f = excelColumnName(femaleColumn);
    const m = excelColumnName(maleColumn);
    sheet.getCell(rows.porcentajeSexo, femaleColumn).value = {
      formula: `IF(${f}${rows.personasTurno}=0,0,${f}${rows.huelga}/${f}${rows.personasTurno})`,
    };
    sheet.getCell(rows.porcentajeSexo, maleColumn).value = {
      formula: `IF(${m}${rows.personasTurno}=0,0,${m}${rows.huelga}/${m}${rows.personasTurno})`,
    };
    sheet.getCell(rows.porcentajeColectivo, femaleColumn).value = {
      formula: `IF(SUM(${f}${rows.personasTurno}:${m}${rows.personasTurno})=0,0,SUM(${f}${rows.huelga}:${m}${rows.huelga})/SUM(${f}${rows.personasTurno}:${m}${rows.personasTurno}))`,
    };
    sheet.getCell(rows.porcentajeColectivo, maleColumn).value = null;
  }

  sheet.getCell(rows.porcentajeSexo, 28).value = {
    formula: `IF(AB${rows.personasTurno}=0,0,AB${rows.huelga}/AB${rows.personasTurno})`,
  };
  sheet.getCell(rows.porcentajeSexo, 29).value = {
    formula: `IF(AC${rows.personasTurno}=0,0,AC${rows.huelga}/AC${rows.personasTurno})`,
  };
  sheet.getCell(rows.porcentajeColectivo, 28).value = {
    formula: `IF(SUM(AB${rows.personasTurno}:AC${rows.personasTurno})=0,0,SUM(AB${rows.huelga}:AC${rows.huelga})/SUM(AB${rows.personasTurno}:AC${rows.personasTurno}))`,
  };
  sheet.getCell(rows.porcentajeColectivo, 29).value = null;
}

function formatSheetName(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}-${month}-${year.slice(-2)}`;
}

function formatFileDate(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}-${month}-${year}`;
}

export async function downloadHuelgaResponseReport(
  fecha: string,
  _sindicatos: string[],
  responses: HuelgaZoneResponse[],
): Promise<void> {
  const missingDetail = responses
    .filter((response) => responseHasData(response) && !(response.generalDetail?.length))
    .map((response) => response.zonaNombre);

  if (missingDetail.length > 0) {
    throw new Error(
      `Para generar el seguimiento con el formato histórico vuelve a importar los Excel de: ${missingDetail.join(', ')}. Los datos guardados anteriormente solo conservaban los totales y no el desglose por turno y sexo.`,
    );
  }

  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(masterTemplateToArrayBuffer());
  workbook.creator = 'TrAcción';
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No se ha podido cargar la plantilla histórica de seguimiento de huelga.');
  sheet.name = formatSheetName(fecha);

  const aggregated = aggregateGeneralDetails(responses);

  for (const rows of Object.values(MASTER_ROWS)) {
    for (const [femaleColumn, maleColumn] of Object.values(MASTER_COLUMNS)) {
      sheet.getCell(rows.huelga, femaleColumn).value = 0;
      sheet.getCell(rows.huelga, maleColumn).value = 0;
      sheet.getCell(rows.trabajan, femaleColumn).value = 0;
      sheet.getCell(rows.trabajan, maleColumn).value = 0;
      sheet.getCell(rows.personasTurno, femaleColumn).value = 0;
      sheet.getCell(rows.personasTurno, maleColumn).value = 0;
      sheet.getCell(rows.serviciosMinimos, femaleColumn).value = 0;
      sheet.getCell(rows.serviciosMinimos, maleColumn).value = 0;
    }
  }

  for (const detail of aggregated.values()) {
    const columns = MASTER_COLUMNS[detail.colectivo];
    const rows = MASTER_ROWS[detail.turno];
    if (!columns || !rows) continue;
    const [femaleColumn, maleColumn] = columns;
    sheet.getCell(rows.huelga, femaleColumn).value = detail.huelga.mujeres;
    sheet.getCell(rows.huelga, maleColumn).value = detail.huelga.hombres;
    sheet.getCell(rows.trabajan, femaleColumn).value = detail.trabajan.mujeres;
    sheet.getCell(rows.trabajan, maleColumn).value = detail.trabajan.hombres;
    sheet.getCell(rows.personasTurno, femaleColumn).value = detail.personasTurno.mujeres;
    sheet.getCell(rows.personasTurno, maleColumn).value = detail.personasTurno.hombres;
    sheet.getCell(rows.serviciosMinimos, femaleColumn).value = detail.serviciosMinimos.mujeres;
    sheet.getCell(rows.serviciosMinimos, maleColumn).value = detail.serviciosMinimos.hombres;
  }

  for (const rows of Object.values(MASTER_ROWS)) {
    setTotalFormula(sheet, rows.huelga);
    setTotalFormula(sheet, rows.trabajan);
    setTotalFormula(sheet, rows.personasTurno);
    setTotalFormula(sheet, rows.serviciosMinimos);
    writePercentFormulas(sheet, rows);
  }

  const totalRows = {
    huelga: 36,
    trabajan: 37,
    personasTurno: 38,
    serviciosMinimos: 39,
    porcentajeSexo: 40,
    porcentajeColectivo: 41,
  };

  for (const [femaleColumn, maleColumn] of Object.values(MASTER_COLUMNS)) {
    const f = excelColumnName(femaleColumn);
    const m = excelColumnName(maleColumn);
    sheet.getCell(totalRows.huelga, femaleColumn).value = { formula: `${f}5+${f}15+${f}25` };
    sheet.getCell(totalRows.huelga, maleColumn).value = { formula: `${m}5+${m}15+${m}25` };
    sheet.getCell(totalRows.trabajan, femaleColumn).value = { formula: `${f}6+${f}16+${f}26` };
    sheet.getCell(totalRows.trabajan, maleColumn).value = { formula: `${m}6+${m}16+${m}26` };
    sheet.getCell(totalRows.personasTurno, femaleColumn).value = { formula: `${f}7+${f}17+${f}27` };
    sheet.getCell(totalRows.personasTurno, maleColumn).value = { formula: `${m}7+${m}17+${m}27` };
    sheet.getCell(totalRows.serviciosMinimos, femaleColumn).value = { formula: `${f}8+${f}18+${f}28` };
    sheet.getCell(totalRows.serviciosMinimos, maleColumn).value = { formula: `${m}8+${m}18+${m}28` };
  }

  setTotalFormula(sheet, totalRows.huelga);
  setTotalFormula(sheet, totalRows.trabajan);
  setTotalFormula(sheet, totalRows.personasTurno);
  setTotalFormula(sheet, totalRows.serviciosMinimos);
  writePercentFormulas(sheet, totalRows);

  const generated = await workbook.xlsx.writeBuffer();
  const blob = new Blob([generated], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `Seguimiento huelga ${formatFileDate(fecha)} general.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
