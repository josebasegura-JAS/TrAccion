import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueSqliteIpc } from './sqliteIpcQueue.js';

describe('enqueueSqliteIpc', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serializa operaciones en orden y devuelve el resultado de cada una', async () => {
    const order: string[] = [];

    const first = enqueueSqliteIpc('primera', async () => {
      order.push('primera');
      return 1;
    });
    const second = enqueueSqliteIpc('segunda', async () => {
      order.push('segunda');
      return 2;
    });

    await vi.runAllTimersAsync();

    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order).toEqual(['primera', 'segunda']);
  });

  it('si una operación se queda colgada (p. ej. red), la cancela pasado el límite y deja avanzar a la siguiente', async () => {
    // Nunca se resuelve: simula un stat() sobre una ruta de red que no responde.
    const hungOperation = enqueueSqliteIpc('operacion-colgada', () => new Promise(() => {}));
    const hungRejection = hungOperation.catch((error: unknown) => error);

    const nextOperation = enqueueSqliteIpc('siguiente-operacion', async () => 'ok');

    await vi.advanceTimersByTimeAsync(10_000);

    const error = await hungRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('operacion-colgada');

    // La operación colgada no debe bloquear a la que va detrás en la cola.
    await expect(nextOperation).resolves.toBe('ok');
  });

  it('si una operación falla, la cola sigue funcionando para la siguiente', async () => {
    const failing = enqueueSqliteIpc('falla', async () => {
      throw new Error('boom');
    });

    await expect(failing).rejects.toThrow('boom');

    const after = enqueueSqliteIpc('despues-del-fallo', async () => 'sigue');
    await vi.runAllTimersAsync();
    await expect(after).resolves.toBe('sigue');
  });
});
