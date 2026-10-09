import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueueSqliteIpc,
  isCurrentSqliteIpcReadOnly,
  isSqliteIpcReadOnlyOperation,
  resolveSqliteIpcTimeoutMs,
} from './sqliteIpcQueue.js';

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

  it('mantiene un límite corto para las operaciones ordinarias', () => {
    expect(resolveSqliteIpcTimeoutMs('database:save-local-storage-record')).toBe(12_000);
  });

  it('da 30 segundos a las lecturas de arranque sobre SMB', () => {
    expect(resolveSqliteIpcTimeoutMs('database:get-persisted-records-token')).toBe(30_000);
    expect(resolveSqliteIpcTimeoutMs('database:load-persisted-records')).toBe(30_000);
  });

  it('da margen adicional a las operaciones de recuperación del bloqueo', () => {
    expect(resolveSqliteIpcTimeoutMs('database:force-release-lock')).toBe(25_000);
    expect(resolveSqliteIpcTimeoutMs('database:get-current-lock')).toBe(25_000);
  });

  it('clasifica como solo lectura las cargas y consultas, pero no los guardados', () => {
    expect(isSqliteIpcReadOnlyOperation('database:get-persisted-records-token')).toBe(true);
    expect(isSqliteIpcReadOnlyOperation('tasks:load-records')).toBe(true);
    expect(isSqliteIpcReadOnlyOperation('configuracion:load')).toBe(true);
    expect(isSqliteIpcReadOnlyOperation('tasks:refresh-open-word')).toBe(true);

    expect(isSqliteIpcReadOnlyOperation('tasks:save-record-if-unchanged')).toBe(false);
    expect(isSqliteIpcReadOnlyOperation('database:migrate-local-storage')).toBe(false);
    expect(isSqliteIpcReadOnlyOperation('database:force-release-lock')).toBe(false);
    expect(isSqliteIpcReadOnlyOperation('database:vacuum-now')).toBe(false);
  });

  it('propaga el contexto read-only durante toda la operación IPC', async () => {
    const read = enqueueSqliteIpc('tasks:load-records', async () => {
      await Promise.resolve();
      return isCurrentSqliteIpcReadOnly();
    });

    await vi.runAllTimersAsync();
    await expect(read).resolves.toBe(true);

    const write = enqueueSqliteIpc('tasks:save-record-if-unchanged', async () => {
      await Promise.resolve();
      return isCurrentSqliteIpcReadOnly();
    });

    await vi.runAllTimersAsync();
    await expect(write).resolves.toBe(false);
  });

  it('informa el timeout al llamador sin afirmar que la operación se haya cancelado', async () => {
    let finishOperation: (() => void) | undefined;
    const timedOutOperation = enqueueSqliteIpc(
      'operacion-lenta',
      () =>
        new Promise<void>((resolve) => {
          finishOperation = resolve;
        }),
    );
    const timeoutResult = timedOutOperation.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(12_000);

    const error = await timeoutResult;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('operacion-lenta');
    expect((error as Error).message).toContain('resultado es indeterminado');
    expect((error as Error).message).not.toContain('cancelado');

    expect(finishOperation).toBeTypeOf('function');
    finishOperation?.();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('mantiene la serialización cuando una operación termina después del timeout', async () => {
    const events: string[] = [];
    let finishFirst: (() => void) | undefined;

    const firstOperation = enqueueSqliteIpc('operacion-lenta-serializada', async () => {
      events.push('primera-inicio');
      await new Promise<void>((resolve) => {
        finishFirst = resolve;
      });
      events.push('primera-fin');
      return 'primera';
    });
    const firstRejection = firstOperation.catch((error: unknown) => error);

    const secondOperation = enqueueSqliteIpc('segunda-operacion', async () => {
      events.push('segunda');
      return 'segunda';
    });

    await vi.advanceTimersByTimeAsync(12_000);

    const error = await firstRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('operacion-lenta-serializada');
    expect(events).toEqual(['primera-inicio']);

    expect(finishFirst).toBeTypeOf('function');
    finishFirst?.();
    await vi.advanceTimersByTimeAsync(0);

    await expect(secondOperation).resolves.toBe('segunda');
    expect(events).toEqual(['primera-inicio', 'primera-fin', 'segunda']);
  });

  it('una lectura de arranque no expira prematuramente a los 10-12 s', async () => {
    let finishStartup: (() => void) | undefined;
    let startupSettled = false;
    const startupOperation = enqueueSqliteIpc(
      'database:get-persisted-records-token',
      () =>
        new Promise<void>((resolve) => {
          finishStartup = resolve;
        }),
    );
    const startupRejection = startupOperation.catch((error: unknown) => error);
    void startupOperation.then(
      () => {
        startupSettled = true;
      },
      () => {
        startupSettled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(12_000);
    expect(resolveSqliteIpcTimeoutMs('database:get-persisted-records-token')).toBe(30_000);
    expect(startupSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(18_000);
    const error = await startupRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('30000 ms');

    expect(finishStartup).toBeTypeOf('function');
    finishStartup?.();
    await vi.advanceTimersByTimeAsync(0);
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
