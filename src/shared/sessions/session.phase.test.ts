import { describe, expect, it } from 'vitest';
import { isTaskInSessionPhase } from './session';

describe('isTaskInSessionPhase', () => {
  const base = { estado: 'pendiente', deletedAt: null };
  it('permite añadir tareas que pasan a Comité aunque la sesión sea anterior', () => {
    expect(isTaskInSessionPhase({ ...base, fase: 'Comité' }, 'comite')).toBe(true);
    expect(isTaskInSessionPhase({ ...base, fase: ' COMITÉ ' }, 'comite')).toBe(true);
  });
  it('acepta la fase Paritaria y rechaza la fase anterior', () => {
    expect(isTaskInSessionPhase({ ...base, fase: 'Paritaria' }, 'paritaria')).toBe(true);
    expect(isTaskInSessionPhase({ ...base, fase: 'tarea' }, 'comite')).toBe(false);
  });
  it('no ofrece tareas cerradas o eliminadas', () => {
    expect(isTaskInSessionPhase({ ...base, fase: 'comite', estado: 'cerrada' }, 'comite')).toBe(false);
    expect(isTaskInSessionPhase({ ...base, fase: 'comite', deletedAt: '2026-10-13' }, 'comite')).toBe(false);
  });
});
