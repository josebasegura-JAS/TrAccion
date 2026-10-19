import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseHuelgaResponseWorkbookForImport } from './huelgasParsedResponseTotals';

function block(sheet: ExcelJS.Worksheet, start: number, shift: string, colectivo: string, huelga: number, trabajan: number, turno: number, minimos: number) {
  sheet.getCell(start, 2).value = shift;
  sheet.getCell(start + 1, 2).value = colectivo;
  sheet.getCell(start + 2, 2).value = 'Mujeres';
  sheet.getCell(start + 2, 3).value = 'Hombres';
  const data = [['huelga', huelga], ['trabajan', trabajan], ['Personas con turno', turno], ['Servicios mínimos', minimos]] as const;
  data.forEach(([label, value], index) => {
    sheet.getCell(start + 3 + index, 1).value = label;
    sheet.getCell(start + 3 + index, 3).value = value;
  });
}

describe('Huelgas - consolidación de Jornada Partida', () => {
  it.each([
    ['OAC', 3, 11, 15, 1],
    ['Jefes de Operaciones', 3, 9, 13, 1],
  ])('suma Jornada Partida al bloque Mañana del colectivo %s', async (colectivo, huelga, trabajan, turno, minimos) => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Seguimiento');
    block(sheet, 2, 'Mañana', colectivo, 1, 5, 7, 1);
    block(sheet, 12, 'Jornada Partida', colectivo, huelga, trabajan, turno, minimos);
    const bytes = new Uint8Array(await book.xlsx.writeBuffer());
    const parsed = await parseHuelgaResponseWorkbookForImport(Uint8Array.from(bytes) as unknown as ArrayBuffer);
    expect(parsed.generalDetail).toHaveLength(1);
    expect(parsed.generalDetail?.[0].turno).toBe('manana');
    expect(parsed.personasHuelga).toBe(1 + huelga);
    expect(parsed.personasTrabajan).toBe(5 + trabajan);
    expect(parsed.personasTurno).toBe(7 + turno);
    expect(parsed.serviciosMinimos).toBe(1 + minimos);
  });
});
