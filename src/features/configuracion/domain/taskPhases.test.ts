import { describe, expect, it } from 'vitest';
import { isProtectedTaskPhaseId } from './taskPhases';

describe('fases estructurales de tareas', () => {
  it('protege Comité y Paritaria como identificadores de circuito', () => {
    expect(isProtectedTaskPhaseId('comite')).toBe(true);
    expect(isProtectedTaskPhaseId('paritaria')).toBe(true);
    expect(isProtectedTaskPhaseId('tarea')).toBe(false);
    expect(isProtectedTaskPhaseId('cerrada')).toBe(false);
  });
});
