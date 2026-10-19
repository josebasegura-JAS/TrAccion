import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseHuelgaResponseWorkbookForImport } from './huelgasParsedResponseTotals';

/** Replica las posiciones reales de las plantillas OAC/Jefatura de 19-10-2026. */
async function makeWorkbook(colectivo: string, blocks: Array<{
  shift: string;
  huelga: [number, number];
  trabajan: [number, number];
  turno: [number, number];
  minimos: [number, number];
}>): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('17-03-2026');
  for (const [index, block] of blocks.entries()) {
    const start = 2 + index * 10;
    sheet.getCell(start, 2).value = block.shift;
    sheet.getCell(start + 1, 2).value = colectivo;
    sheet.getCell(start + 1, 4).value = 'Total';
    sheet.getCell(start + 2, 2).value = 'Mujeres';
    sheet.getCell(start + 2, 3).value = 'Hombres';
    const metrics = [
      ['huelga', block.huelga],
      ['trabajan', block.trabajan],
      ['Personas con turno', block.turno],
      ['Servicios mínimos', block.minimos],
    ] as const;
    for (const [offset, [label, values]] of metrics.entries()) {
      const row = start + 3 + offset;
      sheet.getCell(row, 1).value = label;
      sheet.getCell(row, 2).value = values[0];
      sheet.getCell(row, 3).value = values[1];
      sheet.getCell(row, 4).value = { formula: `SUM(B${row})` };
      sheet.getCell(row, 5).value = { formula: `SUM(C${row})` };
    }
  }
  const bytes = await workbook.xlsx.writeBuffer();
  return Uint8Array.from(bytes) as unknown as ArrayBuffer;
}

describe('Huelgas — bloques separados y totales verificables', () => {
  it.each([
    {
      label: 'OAC',
      colectivo: 'OAC',
      blocks: [
        { shift: 'Mañana', huelga: [2, 1], trabajan: [6, 4], turno: [9, 6], minimos: [1, 1] },
        { shift: 'Jornada Partida', huelga: [1, 2], trabajan: [5, 6], turno: [6, 9], minimos: [0, 1] },
        { shift: 'Tarde', huelga: [3, 1], trabajan: [4, 5], turno: [8, 7], minimos: [1, 1] },
      ],
      expected: [45, 30, 5, 10],
    },
    {
      label: 'Jefatura de Operaciones',
      colectivo: 'Línea (auxiliares,Jefes de Operaciones)',
      blocks: [
        { shift: 'Mañana', huelga: [1, 2], trabajan: [5, 6], turno: [6, 9], minimos: [0, 1] },
        { shift: 'Jornada Partida', huelga: [2, 1], trabajan: [4, 5], turno: [6, 7], minimos: [0, 1] },
        { shift: 'Tarde', huelga: [1, 3], trabajan: [3, 4], turno: [5, 8], minimos: [1, 1] },
      ],
      expected: [41, 27, 4, 10],
    },
  ])('$label incorpora Jornada Partida en Mañana y conserva Tarde', async ({ colectivo, blocks, expected }) => {
    const buffer = await makeWorkbook(colectivo, blocks);
    const parsed = await parseHuelgaResponseWorkbookForImport(buffer);
    expect([parsed.personasTurno, parsed.personasTrabajan, parsed.serviciosMinimos, parsed.personasHuelga]).toEqual(expected);
    const morning = parsed.generalDetail?.find((r) => r.turno === 'manana');
    const afternoon = parsed.generalDetail?.find((r) => r.turno === 'tarde');
    expect(parsed.generalDetail).toHaveLength(2);
    expect(morning?.personasTurno.hombres! + morning?.personasTurno.mujeres!).toBe(
      blocks[0].turno[0] + blocks[0].turno[1] + blocks[1].turno[0] + blocks[1].turno[1],
    );
    expect(afternoon?.personasTurno.hombres! + afternoon?.personasTurno.mujeres!).toBe(
      blocks[2].turno[0] + blocks[2].turno[1],
    );
    for (const row of parsed.generalDetail ?? []) {
      for (const sex of ['hombres', 'mujeres'] as const) {
        expect(row.personasTurno[sex]).toBe(row.trabajan[sex] + row.serviciosMinimos[sex] + row.huelga[sex]);
      }
    }
  });
});
