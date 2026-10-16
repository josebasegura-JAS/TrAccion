import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseHuelgaResponseWorkbookForImport } from './huelgasParsedResponseTotals';

function toArrayBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Uint8Array.from(bytes) as unknown as ArrayBuffer;
}

function writeMmArizBlock(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  shift: string,
  values: { huelga: number; trabajan: number; turno: number; minimos: number },
) {
  sheet.getCell(startRow, 2).value = shift;
  sheet.getCell(startRow + 1, 2).value = 'Material Móvil Ariz';
  sheet.getCell(startRow + 1, 4).value = 'Total';
  sheet.getCell(startRow + 2, 2).value = 'Mujeres';
  sheet.getCell(startRow + 2, 3).value = 'Hombres';
  sheet.getCell(startRow + 2, 4).value = 'Mujeres';
  sheet.getCell(startRow + 2, 5).value = 'Hombres';

  const rows = [
    ['huelga', values.huelga],
    ['trabajan', values.trabajan],
    ['Personas con turno', values.turno],
    ['Servicios mínimos', values.minimos],
  ] as const;

  rows.forEach(([label, value], index) => {
    const row = startRow + 3 + index;
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 3).value = value;
  });
}

describe('Huelgas — importación MM Ariz multibloque', () => {
  it('mantiene Noche y Jornada Cont. separadas y consolida desde todo el H/M', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('15-10-2025');

    writeMmArizBlock(sheet, 1, 'Noche', {
      huelga: 1,
      trabajan: 4,
      turno: 3,
      minimos: 2,
    });
    writeMmArizBlock(sheet, 11, 'Jornada Cont.', {
      huelga: 4,
      trabajan: 36,
      turno: 44,
      minimos: 4,
    });

    const parsed = await parseHuelgaResponseWorkbookForImport(
      toArrayBuffer(await workbook.xlsx.writeBuffer()),
    );

    expect(parsed.generalDetail).toEqual([
      {
        turno: 'noche',
        colectivo: 'Material Móvil',
        huelga: { mujeres: 0, hombres: 1 },
        trabajan: { mujeres: 0, hombres: 4 },
        personasTurno: { mujeres: 0, hombres: 3 },
        serviciosMinimos: { mujeres: 0, hombres: 2 },
      },
      {
        turno: 'manana',
        colectivo: 'Material Móvil',
        huelga: { mujeres: 0, hombres: 4 },
        trabajan: { mujeres: 0, hombres: 36 },
        personasTurno: { mujeres: 0, hombres: 44 },
        serviciosMinimos: { mujeres: 0, hombres: 4 },
      },
    ]);

    expect(parsed.personasTurno).toBe(47);
    expect(parsed.serviciosMinimos).toBe(6);
    expect(parsed.personasTrabajan).toBe(40);
    expect(parsed.personasHuelga).toBe(5);
  });
});
