import { describe, expect, it } from 'vitest';
import { navigationGroups, resolveActiveViewForNavigation } from './navigation';

describe('retirada reversible de Huelgas', () => {
  it('no muestra Huelgas en los grupos del menú', () => {
    expect(navigationGroups.flatMap((group) => group.items).some((item) => item.view === 'huelgas')).toBe(false);
  });

  it('redirige las referencias antiguas de Huelgas al inicio', () => {
    expect(resolveActiveViewForNavigation('huelgas')).toBe('dashboard');
  });

  it('conserva la navegación existente de Comité y Paritaria', () => {
    expect(resolveActiveViewForNavigation('paritaria')).toBe('comite');
    expect(resolveActiveViewForNavigation('comite')).toBe('comite');
  });
});
