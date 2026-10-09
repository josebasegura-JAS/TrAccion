import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  emptyZoneResponse,
  parseHuelgaResponseWorkbook,
  validateZoneResponse,
} from './huelgasResponseCollection';

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
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

  it('detecta incoherencias antes de marcar un circuito como revisado', () => {
    const response = {
      ...emptyZoneResponse('zona-1', 'Zona 1'),
      personasTurno: 10,
      serviciosMinimos: 3,
      personasTrabajan: 6,
      personasHuelga: 2,
    };

    expect(validateZoneResponse(response)).toContain(
      'La suma de servicios mínimos, trabajan y huelga supera las personas con turno.',
    );
  });
});
