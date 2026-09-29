import { describe, expect, it } from 'vitest';
import { createTaskStateIdFromName, DEFAULT_TASK_STATES, normalizeTaskStateName, taskStateLabel } from './taskStates';

describe('taskStates', () => {
  it('mantiene identificadores internos estables para los estados funcionales', () => {
    expect(DEFAULT_TASK_STATES.find((state) => state.protectedRole === 'initial')?.id).toBe('pendiente');
    expect(DEFAULT_TASK_STATES.find((state) => state.protectedRole === 'closed')?.id).toBe('cerrada');
  });

  it('separa el nombre visible del identificador persistido', () => {
    const states = DEFAULT_TASK_STATES.map((state) => state.id === 'cerrada' ? { ...state, nombre: 'Finalizada' } : state);
    expect(taskStateLabel(states, 'cerrada')).toBe('Finalizada');
  });

  it('normaliza nombres e ids de nuevos estados', () => {
    expect(normalizeTaskStateName('  En   revisión  ')).toBe('En revisión');
    expect(createTaskStateIdFromName('En revisión')).toBe('en-revision');
  });
});
