import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  emptyZoneResponse,
  parseHuelgaResponseWorkbook,
} from './huelgasResponseCollection';
import {
  analyzeHuelgaResponseWorkbook,
  validateHuelgaCollection,
  validateHuelgaZoneResponse,
} from './huelgasResponseValidation';

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function validResponse(zoneId: string, zoneName: string) {
  return {
    ...emptyZoneResponse(zoneId, zoneName),
    sourceFileName: `${zoneName}.xlsx`,
    importedAt: '2026-10-09T08:00:00.000Z',
    personasTurno: 10,
    serviciosMinimos: 2,
    personasTrabajan: 6,
    personasHuelga: 2,
    reviewed: true,
  };
}

describe('Huelgas — recogida de respuestas', () => {
  it('importa una tabla de personal y consolida turno, mínimos, trabajan y huelga', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Personal');
    sheet.addRow(['Nº empleado', 'Nombre y apellidos', 'Servicio mínimo', 'Situación', 'Observaciones']);
    sheet.addRow(['100', 'Ana Uno', 'No', 'Huelga', '']);
    sheet.addRow(['101', 'Bea Dos', 'Sí', 'Trabaja', '']);
    sheet.addRow(['102', 'Carlos Tres', 'No', 'Trabaja', '']);

    const parsed = await parseHuelgaResponseWorkbook(toArrayBuffer(await workbook.xlsx.writeBuffer()));

    expect(parsed.personasTurno).toBe(3);
    expect(parsed.serviciosMinimos).toBe(1);
    expect(parsed.personasTrabajan).toBe(1);
    expect(parsed.personasHuelga).toBe(1);
    expect(parsed.huelguistas).toEqual([{ empleado: '100', nombre: 'Ana Uno' }]);
  });

  it('bloquea también cuando el reparto queda por debajo de las personas con turno', () => {
    const response = {
      ...validResponse('zona-1', 'Zona 1'),
      personasTrabajan: 5,
    };

    expect(validateHuelgaZoneResponse(response)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: 'La suma SS.MM. + trabajan + huelga (9) no coincide con las personas con turno (10).',
      }),
    ]));
  });

  it('bloquea si el total de huelga no coincide con el listado nominal detectado', () => {
    const response = {
      ...validResponse('zona-1', 'Zona 1'),
      huelguistas: [{ empleado: '100', nombre: 'Ana Uno' }],
    };

    expect(validateHuelgaZoneResponse(response)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: 'El total de personas en huelga (2) no coincide con el listado nominal detectado (1).',
      }),
    ]));
  });

  it('detecta el mismo empleado informado en huelga en dos circuitos', () => {
    const first = {
      ...validResponse('zona-1', 'Zona 1'),
      huelguistas: [
        { empleado: '100', nombre: 'Ana Uno' },
        { empleado: '101', nombre: 'Bea Dos' },
      ],
    };
    const second = {
      ...validResponse('zona-2', 'Zona 2'),
      huelguistas: [
        { empleado: '100', nombre: 'Ana Uno' },
        { empleado: '102', nombre: 'Carlos Tres' },
      ],
    };

    expect(validateHuelgaCollection([first, second])).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: 'error',
        message: 'El empleado 100 figura en huelga en varios circuitos: Zona 1, Zona 2.',
      }),
    ]));
  });

  it('detecta filas duplicadas, incompletas y estados incompatibles dentro del Excel', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Personal');
    sheet.addRow(['Nº empleado', 'Nombre y apellidos', 'Servicio mínimo', 'Situación']);
    sheet.addRow(['100', 'Ana Uno', 'Sí', 'Huelga']);
    sheet.addRow(['100', 'Ana Uno', 'No', 'Trabaja']);
    sheet.addRow(['101', '', 'No', 'Huelga']);

    const findings = await analyzeHuelgaResponseWorkbook(toArrayBuffer(await workbook.xlsx.writeBuffer()));

    expect(findings).toEqual(expect.arrayContaining([
      expect.stringContaining('figura simultáneamente en huelga y como servicio mínimo'),
      expect.stringContaining('el empleado 100 aparece repetido'),
      expect.stringContaining('fila 4 incompleta'),
    ]));
  });
});
