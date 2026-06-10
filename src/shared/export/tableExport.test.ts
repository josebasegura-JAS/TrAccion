import { describe, expect, it } from 'vitest';
import { buildExcelTableHtml, buildStableExportFilename, escapeExcelValue } from './tableExport';
import type { ExportTablePayload } from './types';

interface Row {
  name: string;
  notes: string;
}

const payload: ExportTablePayload<Row> = {
  title: 'Prueba',
  filename: 'Prueba Excel',
  generatedAt: new Date('2026-06-06T08:30:00'),
  filterLabel: 'Búsqueda: demo',
  columns: [
    { key: 'name', header: 'Nombre', value: (row) => row.name },
    { key: 'notes', header: 'Notas', value: (row) => row.notes },
  ],
  rows: [{ name: '=cmd', notes: 'línea 1\nlínea 2' }],
};

describe('tableExport', () => {
  it('escapa prefijos peligrosos para Excel', () => {
    expect(escapeExcelValue('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeExcelValue(' +1')).toBe("' +1");
  });

  it('genera nombres estables con fecha', () => {
    expect(buildStableExportFilename('Criterios RRLL', new Date('2026-06-06T00:00:00'))).toBe(
      'criterios-rrll-2026-06-06.xlsx',
    );
  });

  it('construye HTML Excel con filtros y texto multilínea', () => {
    const html = buildExcelTableHtml(payload);

    expect(html).toContain('Filtros: Búsqueda: demo');
    expect(html).toContain('&#39;=cmd');
    expect(html).toContain('línea 1\nlínea 2');
    expect(html).not.toContain('Acciones');
  });
});
