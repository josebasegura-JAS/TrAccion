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
