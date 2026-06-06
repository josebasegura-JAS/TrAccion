import { describe, expect, it } from 'vitest';
import { buildPrintableTableHtml } from './buildPrintableTableHtml';

describe('buildPrintableTableHtml', () => {
  it('incluye título, filtros, fecha y filas escapadas', () => {
    const html = buildPrintableTableHtml({
      title: 'Listado',
      filename: 'listado',
      generatedAt: new Date('2026-06-06T08:30:00'),
      filterLabel: 'Estado: activo',
      columns: [{ key: 'name', header: 'Nombre', value: (row: { name: string }) => row.name }],
      rows: [{ name: '<script>alert(1)</script>' }],
    });

    expect(html).toContain('Listado');
    expect(html).toContain('Filtros aplicados: Estado: activo');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
