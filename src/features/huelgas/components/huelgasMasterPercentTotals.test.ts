import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { writePercentFormulas } from './huelgasResponseCollection';

describe('Huelgas — fila Total del seguimiento histórico', () => {
  it.each([
    { nombre: 'Noche', huelga: 5, turno: 7, porcentajeSexo: 9, porcentajeColectivo: 10 },
    { nombre: 'Mañana', huelga: 15, turno: 17, porcentajeSexo: 19, porcentajeColectivo: 20 },
    { nombre: 'Tarde', huelga: 25, turno: 27, porcentajeSexo: 29, porcentajeColectivo: 30 },
    { nombre: 'Acumulado', huelga: 36, turno: 38, porcentajeSexo: 40, porcentajeColectivo: 41 },
  ])('preserva las fórmulas de $nombre en celdas combinadas tras guardar XLSX', async (period) => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Seguimiento');
    // La plantilla histórica combina el porcentaje conjunto H+M de cada colectivo.
    for (let female = 2; female <= 28; female += 2) {
      sheet.mergeCells(period.porcentajeColectivo, female, period.porcentajeColectivo, female + 1);
    }
    writePercentFormulas(sheet, {
      huelga: period.huelga,
      trabajan: period.huelga + 1,
      personasTurno: period.turno,
      serviciosMinimos: period.turno + 1,
      porcentajeSexo: period.porcentajeSexo,
      porcentajeColectivo: period.porcentajeColectivo,
    });
    const bytes = await book.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(bytes as ArrayBuffer);
    const output = loaded.worksheets[0];
    for (let female = 2; female <= 28; female += 2) {
      const cell = output.getCell(period.porcentajeColectivo, female);
      expect(cell.type, `${period.nombre}: columna ${female}`).toBe(ExcelJS.ValueType.Formula);
      expect((cell.value as ExcelJS.CellFormulaValue).formula).toContain('IF(');
      expect(output.getCell(period.porcentajeColectivo, female + 1).isMerged).toBe(true);
    }
  });
});
