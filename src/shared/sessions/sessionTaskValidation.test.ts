import { describe, expect, it } from 'vitest';
import { validatePersistedTaskForSession } from './sessionTaskValidation';

const load = (overrides: Partial<{ id: string; fase: string; estado: string; deletedAt: string | null }> = {}) => async () => [{
  id: 'task-1',
  fase: 'comite',
  estado: 'pendiente',
  deletedAt: null,
  ...overrides,
}];

describe('validatePersistedTaskForSession', () => {
  it('acepta una tarea persistida que sigue activa y en la fase de la sesión', async () => {
    await expect(validatePersistedTaskForSession('task-1', 'comite', load())).resolves.toEqual({
      ok: true,
      message: '',
    });
  });

  it('rechaza una tarea que otro usuario ha movido a otra fase', async () => {
    const result = await validatePersistedTaskForSession('task-1', 'comite', load({ fase: 'tarea' }));

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya no pertenece a la fase comite');
  });

  it('rechaza una tarea cerrada o eliminada', async () => {
    const closed = await validatePersistedTaskForSession('task-1', 'comite', load({ estado: 'cerrada' }));
    const deleted = await validatePersistedTaskForSession('task-1', 'comite', load({ deletedAt: '2026-10-14T08:00:00.000Z' }));

    expect(closed.ok).toBe(false);
    expect(deleted.ok).toBe(false);
  });

  it('rechaza una tarea que ya no existe en SQLite', async () => {
    const result = await validatePersistedTaskForSession('task-1', 'comite', async () => []);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ya no está disponible');
  });
});
