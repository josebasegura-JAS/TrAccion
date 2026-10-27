import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildTableExcelBuffer, openWorkbookInExcel } from './tableExport';
import type { ExportTablePayload } from './types';

const originalTraccion = window.traccion;
afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'traccion', { configurable: true, value: originalTraccion });
});

const payload: ExportTablePayload<{ name: string; amount: number; date: string; note: string | null }> = {
  title: 'Histórico de pedidos', filename: 'Histórico/pedidos', generatedAt: new Date(2026, 11, 31, 12),
  columns: [
    { key: 'name', header: 'Persona', value: row => row.name },
    { key: 'amount', header: 'Importe', value: row => row.amount },
    { key: 'date', header: 'Fecha', value: row => row.date },
    { key: 'note', header: 'Observaciones', value: row => row.note },
  ],
  rows: [
    { name: 'García, Ana', amount: 12.35, date: '2026-12-31', note: 'Primera línea\nSegunda línea' },
    { name: '=SUM(A1:A2)', amount: -2, date: '2027-01-01', note: null },
  ],
};

describe('exportación XLSX real y entrega a Electron', () => {
  it('reabre el fichero sin perder filas, importes, fechas de cambio de año ni texto multilínea', async () => {
    const buffer = await buildTableExcelBuffer(payload);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    expect(Array.from({ length: 4 }, (_, index) => sheet.getRow(4).getCell(index + 1).value))
      .toEqual(['Persona', 'Importe', 'Fecha', 'Observaciones']);
    expect(sheet.getCell('A5').value).toBe('García, Ana');
    expect(sheet.getCell('B5').value).toBe(12.35);
    expect(sheet.getCell('C5').value).toEqual(new Date(2026, 11, 31));
    expect(sheet.getCell('D5').value).toBe('Primera línea\nSegunda línea');
    expect(sheet.getCell('A6').value).toBe('=SUM(A1:A2)');
    expect(sheet.getCell('A6').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B6').value).toBe(-2);
    expect(sheet.getCell('C6').value).toEqual(new Date(2027, 0, 1));
    expect(sheet.getCell('D6').value).toBeNull();
    expect(sheet.rowCount).toBe(6);
    expect(payload.rows[0].name).toBe('García, Ana');
  });

  it('exporta una selección vacía con sus cabeceras y sin inventar registros', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await buildTableExcelBuffer({ ...payload, rows: [] }));
    const sheet = workbook.worksheets[0];
    expect(sheet.getCell('A4').value).toBe('Persona');
    expect(sheet.getCell('B4').value).toBe('Importe');
    expect(sheet.rowCount).toBe(4);
  });

  it('entrega solo los bytes de la vista, sin incluir datos adyacentes del buffer', async () => {
    const openExcelWorkbook = vi.fn(async () => ({ ok: true }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: { openExcelWorkbook } });
    const source = Uint8Array.from([99, 80, 75, 3, 4, 88]);
    await openWorkbookInExcel(source.subarray(1, 5), 'pedido.xlsx');
    expect(openExcelWorkbook).toHaveBeenCalledTimes(1);
    const [buffer, filename] = openExcelWorkbook.mock.calls[0] as unknown as [ArrayBuffer, string];
    expect(Array.from(new Uint8Array(buffer))).toEqual([80, 75, 3, 4]);
    expect(filename).toBe('pedido.xlsx');
  });

  it('propaga el rechazo de Electron y no informa de una exportación correcta', async () => {
    const openExcelWorkbook = vi.fn(async () => ({ ok: false, message: 'Carpeta de red inaccesible' }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: { openExcelWorkbook } });
    await expect(openWorkbookInExcel(new ArrayBuffer(4), 'pedido.xlsx'))
      .rejects.toThrow('Carpeta de red inaccesible');
    expect(openExcelWorkbook).toHaveBeenCalledTimes(1);
  });
});
