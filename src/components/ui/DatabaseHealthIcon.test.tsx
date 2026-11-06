import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildDatabaseStatusBadge } from '../../services/databaseStatusView';
import { DatabaseHealthIcon } from './DatabaseHealthIcon';

describe('DatabaseHealthIcon', () => {
  it('muestra icono verde cuando la base compartida está operativa', () => {
    const status = buildDatabaseStatusBadge({
      ready: true,
      engine: 'sqlite',
      phase: 'active',
      path: 'G:\\RRLL\\traccion.sqlite',
      isDefaultPath: false,
    });
    const html = renderToStaticMarkup(<DatabaseHealthIcon status={status} />);
    expect(status.tone).toBe('ok');
    expect(html).toContain('text-emerald-300');
    expect(html).toContain('aria-label="Estado de base de datos');
    expect(html).not.toContain('SQLite activo');
  });

  it('reserva amarillo para estado en comprobación y rojo para error', () => {
    const amber = renderToStaticMarkup(<DatabaseHealthIcon status={buildDatabaseStatusBadge(null)} />);
    const red = renderToStaticMarkup(<DatabaseHealthIcon status={buildDatabaseStatusBadge({
      ready: false,
      engine: 'sqlite',
      phase: 'error',
      path: 'G:\\RRLL\\traccion.sqlite',
      isDefaultPath: false,
      message: 'Sin conexión',
    })} />);
    expect(amber).toContain('text-amber-300');
    expect(red).toContain('text-red-300');
  });
});
