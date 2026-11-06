import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { InlineNotice } from './InlineNotice';

describe('InlineNotice', () => {
  it('marca los errores críticos como alerta', () => {
    const html = renderToStaticMarkup(<InlineNotice tone="error">Error al guardar</InlineNotice>);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Error al guardar');
  });

  it('presenta las advertencias informativas sin alarmar', () => {
    const html = renderToStaticMarkup(<InlineNotice tone="warning">Excel pendiente</InlineNotice>);
    expect(html).toContain('role="status"');
    expect(html).toContain('Excel pendiente');
  });

  it('preserva la acción de recuperación', () => {
    const html = renderToStaticMarkup(<InlineNotice tone="warning" action={<button type="button">Reintentar</button>}>Respaldo pendiente</InlineNotice>);
    expect(html).toContain('Reintentar');
    expect(html).toContain('Respaldo pendiente');
  });
});
