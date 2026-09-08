import { describe, expect, it } from 'vitest';
import {
  resolveActiveViewForNavigation,
  resolveCommitteeOrganForNavigation,
} from './navigation';

describe('navegación Comité / Paritaria', () => {
  it('normaliza Paritaria a la única pantalla operativa Comité / Paritaria', () => {
    expect(resolveActiveViewForNavigation('paritaria')).toBe('comite');
    expect(resolveActiveViewForNavigation('comite')).toBe('comite');
  });

  it('conserva el órgano semántico para abrir el panel correcto', () => {
    expect(resolveCommitteeOrganForNavigation('paritaria')).toBe('paritaria');
    expect(resolveCommitteeOrganForNavigation('comite')).toBe('comite');
    expect(resolveCommitteeOrganForNavigation('tareas')).toBeNull();
  });
});
