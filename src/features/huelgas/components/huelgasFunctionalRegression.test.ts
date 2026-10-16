import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  emptyZoneResponse,
  parseHuelgaResponseWorkbook,
  type HuelgaGeneralDetail,
  type HuelgaResponseCollection,
  type HuelgaZoneResponse,
} from './huelgasResponseCollection';
import { isHuelgaResultsReady } from './huelgasResultsAccess';
import { buildHuelgaResults } from './huelgasResults';
import { validateHuelgaCollection, validateHuelgaZoneResponse } from './huelgasResponseValidation';
import { mergeHuelgaImportedDetail } from './huelgasIncrementalImports';

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Uint8Array.from(bytes) as unknown as ArrayBuffer;
}

function detail(
  turno: 'noche' | 'manana' | 'tarde',
  colectivo: string,
  values: { turno: number; minimos: number; trabajan: number; huelga: number },
): HuelgaGeneralDetail {
  return {
    turno,
    colectivo,
    personasTurno: { hombres: values.turno, mujeres: 0 },
    serviciosMinimos: { hombres: values.minimos, mujeres: 0 },
    trabajan: { hombres: values.trabajan, mujeres: 0 },
    huelga: { hombres: values.huelga, mujeres: 0 },
  };
}

function response(
  zonaId: string,
  generalDetail: HuelgaGeneralDetail[],
  overrides: Partial<HuelgaZoneResponse> = {},
): HuelgaZoneResponse {
  const sum = (field: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') =>
    generalDetail.reduce((total, row) => total + row[field].hombres + row[field].mujeres, 0);

  return {
    ...emptyZoneResponse(zonaId, zonaId),
    sourceFileName: `${zonaId}.xlsx`,
    importedAt: '2026-10-16T08:00:00.000Z',
    personasTurno: sum('personasTurno'),
    serviciosMinimos: sum('serviciosMinimos'),
    personasTrabajan: sum('trabajan'),
    personasHuelga: sum('huelga'),
    reviewed: true,
    generalDetail,
    ...overrides,
  };
}

function collection(...responses: HuelgaZoneResponse[]): HuelgaResponseCollection {
  return {
    huelgaId: 'h-regression',
    responses: Object.fromEntries(responses.map((item) => [item.zonaId, item])),
    updatedAt: '2026-10-16T08:30:00.000Z',
  };
}

describe('Huelgas — regresión funcional de recogida y resultados', () => {
  it('recorre Excel -> parser -> validación -> autorización -> resultado global sin alterar los totales', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Personal');
    sheet.addRow(['Nº empleado', 'Nombre y apellidos', 'Servicio mínimo', 'Situación', 'Observaciones']);
    sheet.addRow(['100', 'Ana Uno', 'No', 'Huelga', '']);
    sheet.addRow(['101', 'Bea Dos', 'Sí', 'Trabaja', '']);
    sheet.addRow(['102', 'Carlos Tres', 'No', 'Trabaja', '']);
    sheet.addRow(['103', 'Diana Cuatro', 'No', 'Trabaja', '']);

    const parsed = await parseHuelgaResponseWorkbook(toArrayBuffer(await workbook.xlsx.writeBuffer()));
    const imported: HuelgaZoneResponse = {
      ...emptyZoneResponse('zona-a', 'Zona A'),
      ...parsed,
      sourceFileName: 'zona-a.xlsx',
      importedAt: '2026-10-16T08:00:00.000Z',
      reviewed: true,
    };
    const data = collection(imported);

    expect(validateHuelgaZoneResponse(imported).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(validateHuelgaCollection([imported]).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(isHuelgaResultsReady(data)).toBe(true);

    const results = buildHuelgaResults(data);
    expect(results.global.totals).toMatchObject({
      personasTurno: 4,
      serviciosMinimos: 1,
      personasTrabajan: 2,
      personasHuelga: 1,
      personasComputables: 4,
      seguimiento: 25,
    });
  });

  it('mantiene Noche, Mañana y Tarde separadas y calcula Global con personas reales', () => {
    const zone = response('operacion', [
      detail('noche', 'Operación', { turno: 100, minimos: 10, trabajan: 70, huelga: 20 }),
      detail('manana', 'Operación', { turno: 50, minimos: 5, trabajan: 35, huelga: 10 }),
      detail('tarde', 'Operación', { turno: 20, minimos: 2, trabajan: 16, huelga: 2 }),
    ]);

    const results = buildHuelgaResults(collection(zone));
    expect(results.noche.totals.seguimiento).toBe(20);
    expect(results.manana.totals.seguimiento).toBe(20);
    expect(results.tarde.totals.seguimiento).toBe(10);
    expect(results.global.totals.personasTurno).toBe(170);
    expect(results.global.totals.personasHuelga).toBe(32);
    expect(results.global.totals.seguimiento).toBeCloseTo(18.8235, 3);
  });

  it('incluye servicios mínimos en personas con turno pero no en personas que trabajan', () => {
    const zone = response('linea', [
      detail('noche', 'Línea', { turno: 57, minimos: 16, trabajan: 35, huelga: 6 }),
    ]);

    const results = buildHuelgaResults(collection(zone));
    expect(results.noche.totals.personasTurno).toBe(57);
    expect(results.noche.totals.serviciosMinimos).toBe(16);
    expect(results.noche.totals.personasTrabajan).toBe(35);
    expect(results.noche.totals.personasHuelga).toBe(6);
    expect(results.noche.totals.seguimiento).toBeCloseTo(10.5263, 3);
  });

  it('evita regresiones a una media de porcentajes entre áreas de distinto tamaño', () => {
    const grande = response('grande', [
      detail('manana', 'Área grande', { turno: 100, minimos: 10, trabajan: 70, huelga: 20 }),
    ]);
    const pequena = response('pequena', [
      detail('manana', 'Área pequeña', { turno: 20, minimos: 10, trabajan: 0, huelga: 10 }),
    ]);

    const results = buildHuelgaResults(collection(grande, pequena));
    expect(results.manana.areas.map((area) => area.seguimiento).sort((a, b) => a - b)).toEqual([20, 50]);
    expect(results.manana.totals.seguimiento).toBe(25);
    expect(results.manana.totals.seguimiento).not.toBe(35);
  });

  it('devuelve seguimiento cero cuando un corte tiene cero personas con turno', () => {
    const zero = response('sin-turno', [
      detail('tarde', 'Sin turno', { turno: 0, minimos: 0, trabajan: 0, huelga: 0 }),
    ]);

    const results = buildHuelgaResults(collection(zero));
    expect(results.tarde.hasData).toBe(true);
    expect(results.tarde.totals.personasTurno).toBe(0);
    expect(results.tarde.totals.seguimiento).toBe(0);
  });

  it('una respuesta correcta pero pendiente de revisión no habilita resultados', () => {
    const pending = response('zona-a', [
      detail('noche', 'Zona A', { turno: 10, minimos: 1, trabajan: 7, huelga: 2 }),
    ], { reviewed: false });

    expect(validateHuelgaZoneResponse(pending).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(isHuelgaResultsReady(collection(pending))).toBe(false);
  });

  it('una corrección incremental sustituye sólo el bloque afectado y recalcula el resultado sin tocar los otros cortes', () => {
    const original = [
      detail('noche', 'Línea', { turno: 10, minimos: 1, trabajan: 7, huelga: 2 }),
      detail('manana', 'Línea', { turno: 20, minimos: 2, trabajan: 14, huelga: 4 }),
      detail('tarde', 'Línea', { turno: 30, minimos: 3, trabajan: 24, huelga: 3 }),
    ];
    const correction = [
      detail('manana', 'Línea', { turno: 20, minimos: 2, trabajan: 16, huelga: 2 }),
    ];

    const merged = mergeHuelgaImportedDetail(original, correction);
    const corrected = response('linea', merged);
    const results = buildHuelgaResults(collection(corrected));

    expect(merged).toHaveLength(3);
    expect(results.noche.totals.personasHuelga).toBe(2);
    expect(results.manana.totals.personasHuelga).toBe(2);
    expect(results.tarde.totals.personasHuelga).toBe(3);
    expect(results.global.totals.personasHuelga).toBe(7);
    expect(results.global.totals.personasTurno).toBe(60);
  });

  it('bloquea resultados cuando la suma SS.MM. + trabajan + huelga deja de cuadrar con personas con turno', () => {
    const invalid = response('zona-a', [
      detail('noche', 'Zona A', { turno: 10, minimos: 1, trabajan: 7, huelga: 2 }),
    ], { personasTrabajan: 8 });

    expect(validateHuelgaZoneResponse(invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'error' }),
    ]));
    expect(isHuelgaResultsReady(collection(invalid))).toBe(false);
  });
});
