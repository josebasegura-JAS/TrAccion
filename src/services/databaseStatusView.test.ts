import { describe, expect, it } from 'vitest';

import { buildDatabaseStatusBadge } from './databaseStatusView';

describe('buildDatabaseStatusBadge', () => {
  it('no presenta localStorage como modo operativo cuando no hay estado SQLite', () => {
    const badge = buildDatabaseStatusBadge(null);

    expect(badge.label).toBe('SQLite no disponible');
    expect(badge.detail).toBe('edición bloqueada');
    expect(badge.title).toContain('edición permanece bloqueada');
    expect(badge.title.toLowerCase()).not.toContain('fallback localstorage');
  });

  it('presenta el estado fallback como SQLite no disponible y edición bloqueada', () => {
    const badge = buildDatabaseStatusBadge({
      ready: false,
      engine: 'sqlite',
      phase: 'fallback',
      path: 'G:\\RRLL\\traccion.sqlite',
      isDefaultPath: false,
      message: 'No se puede acceder a la ruta compartida.',
    });

    expect(badge.label).toBe('SQLite no disponible');
    expect(badge.requiresAttention).toBe(true);
    expect(badge.title).toContain('Edición bloqueada');
  });

  it('mantiene SQLite activa como estado correcto solo en una ruta no predeterminada', () => {
    const badge = buildDatabaseStatusBadge({
      ready: true,
      engine: 'sqlite',
      phase: 'active',
      path: 'G:\\RRLL\\traccion.sqlite',
      isDefaultPath: false,
    });

    expect(badge.label).toBe('SQLite activo');
    expect(badge.tone).toBe('ok');
    expect(badge.requiresAttention).toBe(false);
  });
});
