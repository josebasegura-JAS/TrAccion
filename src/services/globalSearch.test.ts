import { describe, expect, it } from 'vitest';
import { searchTraccion } from './globalSearch';

describe('globalSearch closed committee/paritaria sessions', () => {
  it('finds a closed committee session by its observations', () => {
    const results = searchTraccion('turnos nocturnos', {
      committeeSessions: [{ id: 'comite-closed-1', code: 'CE-12/2026', date: '2026-09-15', title: 'Comité septiembre', observations: 'Resumen del acuerdo sobre turnos nocturnos', notes: '', status: 'closed', items: [], treatedTaskIds: [], untreatedTaskIds: [], closedAt: '2026-09-15T12:00:00.000Z' }],
      paritariaSessions: [], tasks: [],
    });
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ moduleView: 'comite', recordId: 'comite-closed-1', status: 'closed' })]));
  });

  it('finds a closed paritaria session through a linked closed task', () => {
    const results = searchTraccion('bolsa de horas', {
      committeeSessions: [],
      paritariaSessions: [{ id: 'paritaria-closed-1', code: 'CP-07/2026', date: '2026-07-28', title: 'Comisión Paritaria julio', observations: '', notes: '', status: 'closed', items: ['task-closed-1'], treatedTaskIds: ['task-closed-1'], untreatedTaskIds: [], closedAt: '2026-07-28T12:00:00.000Z' }],
      tasks: [{ id: 'task-closed-1', titulo: 'Regularización bolsa de horas', descripcion: 'Punto tratado y cerrado en la comisión', observaciones: '', fase: 'cerrada', estado: 'cerrada', closedAt: '2026-07-28T12:00:00.000Z' }],
    });
    expect(results).toEqual(expect.arrayContaining([expect.objectContaining({ moduleView: 'paritaria', recordId: 'paritaria-closed-1', status: 'closed', matchReason: 'Coincidencia en punto incluido en sesión' })]));
  });
});
