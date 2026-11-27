import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { importTeletrabajoPuestosFromFile } from './puestosTeletrabajo';

function textFile(name: string, text: string): File {
  return { name, text: async () => text } as File;
}
describe('T8B: importación de puestos de teletrabajo', () => {
  it('lee CSV con separadores dentro de comillas y deduplica puestos normalizados', async () => {
    const result = await importTeletrabajoPuestosFromFile(textFile('puestos.csv', 'Puesto;Presencialidad mínima;Dotación;Observaciones\nTécnico;1;3;"Nota; interna"\nTECNICO;2;4;"Texto ""literal"""\n'));
    expect(result).toEqual([{ draft: { puesto: 'TECNICO', maxSolicitudes: 2, dotacionComputable: 4, grupoCoberturaId: null, observaciones: 'Texto "literal"' }, grupoCoberturaNombre: '' }]);
  });
  it('lee TSV y no incorpora puestos no teletrabajables', async () => {
    const result = await importTeletrabajoPuestosFromFile(textFile('puestos.tsv', 'Puesto\tTeletrabajo S/N\tDotación\nTécnico\tSí\t3\nConserje\tNo\t2'));
    expect(result.map(row => row.draft.puesto)).toEqual(['Técnico']);
    expect(result[0].draft.dotacionComputable).toBe(3);
  });
  it('importa un libro XLSX real con grupo de cobertura', async () => {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Puestos');
    sheet.addRow(['Puesto', 'Presencialidad mínima', 'Dotación', 'Grupo cobertura']);
    sheet.addRow(['Técnico', 2, 4, 'Administración']);
    const buffer = await book.xlsx.writeBuffer();
    const file = { name: 'puestos.xlsx', arrayBuffer: async () => new Uint8Array(buffer as unknown as ArrayBuffer).slice().buffer } as File;
    expect(await importTeletrabajoPuestosFromFile(file)).toEqual([{ draft: { puesto: 'Técnico', maxSolicitudes: 2, dotacionComputable: 4, grupoCoberturaId: null, observaciones: '' }, grupoCoberturaNombre: 'Administración' }]);
  });
  it('rechaza archivo sin cabecera de puesto', async () => {
    await expect(importTeletrabajoPuestosFromFile(textFile('puestos.csv', 'Nombre;Dotación\nPersona;2'))).rejects.toThrow(/Puesto Organizativo/);
  });
});
