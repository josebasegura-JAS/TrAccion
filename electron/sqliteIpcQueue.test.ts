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

  it('si una operación ordinaria se queda colgada, la cancela a los 12 s y deja avanzar la cola', async () => {
    const hungOperation = enqueueSqliteIpc('operacion-colgada', () => new Promise(() => {}));
    const hungRejection = hungOperation.catch((error: unknown) => error);

    const nextOperation = enqueueSqliteIpc('siguiente-operacion', async () => 'ok');

    await vi.advanceTimersByTimeAsync(12_000);

    const error = await hungRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('operacion-colgada');
    await expect(nextOperation).resolves.toBe('ok');
  });

  it('una lectura de arranque no se cancela prematuramente a los 10-12 s', async () => {
    const startupOperation = enqueueSqliteIpc(
      'database:get-persisted-records-token',
      () => new Promise(() => {}),
    );
    const startupRejection = startupOperation.catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(12_000);
    expect(resolveSqliteIpcTimeoutMs('database:get-persisted-records-token')).toBe(30_000);

    await vi.advanceTimersByTimeAsync(18_000);
    const error = await startupRejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('30000 ms');
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
