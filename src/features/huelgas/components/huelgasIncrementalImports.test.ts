import { describe, expect, it } from 'vitest';
import type { HuelgaGeneralDetail } from './huelgasResponseCollection';
import {
  filterHuelgaDetailWithContent,
  findHuelgaImportConflicts,
  mergeHuelgaImportedDetail,
} from './huelgasIncrementalImports';

function detail(turno: 'noche' | 'manana' | 'tarde', colectivo: string, turnoTotal: number): HuelgaGeneralDetail {
  return {
    turno,
    colectivo,
    huelga: { mujeres: 0, hombres: 0 },
    trabajan: { mujeres: 0, hombres: turnoTotal },
    personasTurno: { mujeres: 0, hombres: turnoTotal },
    serviciosMinimos: { mujeres: 0, hombres: 0 },
  };
}

describe('huelgas incremental imports', () => {
  it('keeps explicit zero blocks but ignores blocks whose metric cells are blank', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Seguimiento');

    sheet.getCell('B1').value = 'Mañana';
    sheet.getCell('B2').value = 'Línea (auxiliares, Jefes de Operaciones, personal administrativos y personal formación)';
    sheet.getCell('B3').value = 'Mujeres';
    sheet.getCell('C3').value = 'Hombres';
    sheet.getCell('A4').value = 'huelga';
    sheet.getCell('A5').value = 'trabajan';
    sheet.getCell('A6').value = 'Personas con turno';
    sheet.getCell('A7').value = 'Servicios mínimos';
    // Un cero escrito es contenido real.
    sheet.getCell('B4').value = 0;
    sheet.getCell('C4').value = 0;
    sheet.getCell('B5').value = 1;
    sheet.getCell('C5').value = 3;
    sheet.getCell('B6').value = 1;
    sheet.getCell('C6').value = 3;

    sheet.getCell('B10').value = 'Tarde';
    sheet.getCell('B11').value = 'Línea (auxiliares, Jefes de Operaciones, personal administrativos y personal formación)';
    sheet.getCell('B12').value = 'Mujeres';
    sheet.getCell('C12').value = 'Hombres';
    sheet.getCell('A13').value = 'huelga';
    sheet.getCell('A14').value = 'trabajan';
    sheet.getCell('A15').value = 'Personas con turno';
    sheet.getCell('A16').value = 'Servicios mínimos';
    // Este bloque queda totalmente vacío.

    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = [detail('manana', 'Línea', 4), detail('tarde', 'Línea', 0)];
    const filtered = await filterHuelgaDetailWithContent(buffer as ArrayBuffer, parsed);

    expect(filtered.map((row) => row.turno)).toEqual(['manana']);
  });

  it('detects Tarde after sparse rows: actualRowCount is not the last row index', async () => {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Seguimiento');

    const addBlock = (start: number, shift: string, persons: number) => {
      sheet.getCell(start, 2).value = shift;
      sheet.getCell(start + 1, 2).value = 'Conducción';
      sheet.getCell(start + 2, 2).value = 'Mujeres';
      sheet.getCell(start + 2, 3).value = 'Hombres';
      for (const [offset, label, value] of [
        [3, 'huelga', 0],
        [4, 'trabajan', persons],
        [5, 'Personas con turno', persons],
        [6, 'Servicios mínimos', 0],
      ] as const) {
        sheet.getCell(start + offset, 1).value = label;
        sheet.getCell(start + offset, 2).value = 0;
        sheet.getCell(start + offset, 3).value = value;
      }
    };

    addBlock(2, 'Noche', 2);
    addBlock(22, 'Mañana', 5);
    addBlock(62, 'Tarde', 7);
    expect(sheet.actualRowCount).toBeLessThan(62);
    expect(sheet.rowCount).toBeGreaterThan(62);

    const bytes = await workbook.xlsx.writeBuffer();
    const buffer = Uint8Array.from(new Uint8Array(bytes as ArrayBuffer)) as unknown as ArrayBuffer;
    const incoming = [
      detail('noche', 'Conducción', 2),
      detail('manana', 'Conducción', 5),
      detail('tarde', 'Conducción', 7),
    ];
    const filtered = await filterHuelgaDetailWithContent(buffer, incoming);
    expect(filtered.map((item) => item.turno)).toEqual(['noche', 'manana', 'tarde']);
    expect(filtered.reduce((total, item) => total + item.personasTurno.hombres, 0)).toBe(14);
  });

  it('replaces only conflicting turno+colectivo and preserves the rest', () => {
    const existing = [detail('noche', 'Línea', 5), detail('manana', 'Línea', 4)];
    const incoming = [detail('manana', 'Línea', 6), detail('tarde', 'Línea', 7)];

    expect(findHuelgaImportConflicts(existing, incoming)).toEqual(['manana::Línea']);
    const merged = mergeHuelgaImportedDetail(existing, incoming);

    expect(merged).toHaveLength(3);
    expect(merged.find((row) => row.turno === 'noche')?.personasTurno.hombres).toBe(5);
    expect(merged.find((row) => row.turno === 'manana')?.personasTurno.hombres).toBe(6);
    expect(merged.find((row) => row.turno === 'tarde')?.personasTurno.hombres).toBe(7);
  });
});
