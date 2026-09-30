import { describe, expect, it, vi } from 'vitest';
import {
  beginBackgroundActivity,
  getBackgroundActivityState,
  runBackgroundActivity,
  subscribeBackgroundActivity,
} from './backgroundActivity';

describe('backgroundActivity', () => {
  it('registra y finaliza una actividad', () => {
    const finish = beginBackgroundActivity({ kind: 'database', label: 'Consultando…' });
    expect(getBackgroundActivityState().activities).toHaveLength(1);
    finish();
    expect(getBackgroundActivityState().activities).toHaveLength(0);
  });

  it('soporta actividades simultáneas sin cerrar las demás', () => {
    const finishA = beginBackgroundActivity({ kind: 'sync', label: 'A' });
    const finishB = beginBackgroundActivity({ kind: 'load', label: 'B' });
    expect(getBackgroundActivityState().activities).toHaveLength(2);
    finishB();
    expect(getBackgroundActivityState().activities.map((item) => item.label)).toEqual(['A']);
    finishA();
  });

  it('runBackgroundActivity finaliza incluso si la operación falla', async () => {
    await expect(runBackgroundActivity(
      { kind: 'search', label: 'Buscando…' },
      async () => { throw new Error('fallo'); },
    )).rejects.toThrow('fallo');
    expect(getBackgroundActivityState().activities).toHaveLength(0);
  });

  it('notifica cambios a los suscriptores', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBackgroundActivity(listener);
    const finish = beginBackgroundActivity({ kind: 'import', label: 'Importando…' });
    finish();
    unsubscribe();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
