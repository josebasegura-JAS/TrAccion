import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExportPrintButtons } from './ExportPrintButtons';

vi.mock('../../components/ui/useToast', () => ({
  useToast: () => ({ error: vi.fn() }),
}));

describe('ExportPrintButtons compacto', () => {
  const payload = {
    title: 'Tareas activas',
    filename: 'tareas-activas',
    columns: [{ key: 'titulo', header: 'Título', value: (task: { titulo: string }) => task.titulo }],
    rows: [{ titulo: 'Prueba' }],
  };

  it('conserva acciones accesibles aunque solo muestre iconos', () => {
    const html = renderToStaticMarkup(<ExportPrintButtons payload={payload} compactIcons />);
    expect(html).toContain('aria-label="Exportar Excel"');
    expect(html).toContain('aria-label="Imprimir"');
    expect(html).not.toContain('<span>Exportar Excel</span>');
  });

  it('mantiene botones con texto por defecto para el resto de módulos', () => {
    const html = renderToStaticMarkup(<ExportPrintButtons payload={payload} />);
    expect(html).toContain('<span>Exportar Excel</span>');
    expect(html).toContain('<span>Imprimir</span>');
  });
});
