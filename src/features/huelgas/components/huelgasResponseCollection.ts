export const HUELGAS_RESPONSE_STORAGE_KEY = 'traccion.v1.huelgas.recogidas';

export type HuelgaStrikePerson = {
  empleado: string;
  nombre: string;
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
};

export type HuelgaResponseCollection = {
  huelgaId: string;
  responses: Record<string, HuelgaZoneResponse>;
  updatedAt: string;
};

export type HuelgaResponseCollections = Record<string, HuelgaResponseCollection>;

export type ParsedHuelgaResponse = Pick<
  HuelgaZoneResponse,
  'personasTurno' | 'serviciosMinimos' | 'personasTrabajan' | 'personasHuelga' | 'huelguistas' | 'warnings'
>;

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function isStrikePerson(value: unknown): value is HuelgaStrikePerson {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HuelgaStrikePerson>;
  return typeof candidate.empleado === 'string' && typeof candidate.nombre === 'string';
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
    Array.isArray(candidate.warnings) && candidate.warnings.every((item) => typeof item === 'string')
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
  return aliases.some((alias) => normalized.includes(normalize(alias)));
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
};

function findHeaderIndex(texts: string[], aliases: string[]): number {
  const normalizedAliases = aliases.map(normalize);
  return texts.findIndex((text) => normalizedAliases.includes(normalize(text)));
}

type SheetReader = {
  getCell: (row: number, column: number) => { text: string };
  actualColumnCount: number;
  actualRowCount: number;
};

function nextNumericValue(sheet: SheetReader, row: number, column: number): number | null {
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

function scanLabelMetric(sheet: SheetReader, aliases: string[]): number | null {
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
        const isStrike = situation.includes('huelga') || (isStrikeSheet && situation !== 'trabaja');
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

  const personasTurno = metricTurno ?? tableTurno;
  const serviciosMinimos = metricMinimos ?? tableMinimos;
  const personasTrabajan = metricTrabajan ?? tableTrabajan;
  const personasHuelga = metricHuelga ?? (uniqueHuelguistas.length > 0 ? uniqueHuelguistas.length : tableHuelga);
  const warnings: string[] = [];
  if (personasTurno === null) warnings.push('No se ha localizado automáticamente el total de personas con turno.');
  if (serviciosMinimos === null) warnings.push('No se ha localizado automáticamente el total de servicios mínimos.');
  if (personasTrabajan === null) warnings.push('No se ha localizado automáticamente el total de personas que trabajan.');
  if (personasHuelga === null) warnings.push('No se ha localizado automáticamente el total de personas en huelga.');

  return { personasTurno, serviciosMinimos, personasTrabajan, personasHuelga, huelguistas: uniqueHuelguistas, warnings };
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

function workbookBufferToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  throw new Error('No se ha podido convertir el Excel generado a un fichero válido.');
}

export async function downloadHuelgaResponseReport(
  fecha: string,
  sindicatos: string[],
  responses: HuelgaZoneResponse[],
): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAcción';
  workbook.created = new Date();
  const summary = workbook.addWorksheet('Resumen');
  summary.addRow(['SEGUIMIENTO DE HUELGA']);
  summary.addRow(['Fecha', fecha]);
  summary.addRow(['Convocantes', sindicatos.join(' · ')]);
  summary.addRow([]);
  summary.addRow(['Circuito', 'Personas con turno', 'Servicios mínimos', 'Personas que trabajan', 'Personas en huelga', '% huelga', 'Revisado', 'Fichero', 'Observaciones']);
  for (const response of responses) {
    const percentage = response.personasTurno && response.personasHuelga !== null
      ? response.personasHuelga / response.personasTurno
      : null;
    summary.addRow([
      response.zonaNombre,
      response.personasTurno ?? '',
      response.serviciosMinimos ?? '',
      response.personasTrabajan ?? '',
      response.personasHuelga ?? '',
      percentage,
      response.reviewed ? 'Sí' : 'No',
      response.sourceFileName,
      response.observaciones,
    ]);
  }
  const totals = collectionTotals(responses);
  const totalPercentage = totals.personasTurno > 0 ? totals.personasHuelga / totals.personasTurno : null;
  summary.addRow(['TOTAL', totals.personasTurno, totals.serviciosMinimos, totals.personasTrabajan, totals.personasHuelga, totalPercentage, '', '', '']);
  summary.getRow(1).font = { bold: true, size: 16 };
  summary.getRow(5).font = { bold: true };
  summary.getRow(summary.rowCount).font = { bold: true };
  summary.columns = [
    { width: 28 }, { width: 20 }, { width: 18 }, { width: 22 }, { width: 18 }, { width: 12 }, { width: 12 }, { width: 34 }, { width: 40 },
  ];
  for (let row = 6; row <= summary.rowCount; row += 1) summary.getCell(row, 6).numFmt = '0.0%';

  const strikeSheet = workbook.addWorksheet('Personal en huelga');
  strikeSheet.addRow(['Circuito', 'Nº empleado', 'Nombre y apellidos']);
  for (const response of responses) {
    for (const person of response.huelguistas) strikeSheet.addRow([response.zonaNombre, person.empleado, person.nombre]);
  }
  strikeSheet.getRow(1).font = { bold: true };
  strikeSheet.columns = [{ width: 28 }, { width: 16 }, { width: 42 }];

  const bytes = workbookBufferToArrayBuffer(await workbook.xlsx.writeBuffer());
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `Seguimiento_huelga_${fecha.split('-').reverse().join('-')}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(href);
}
