import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushPendingRecordWrites,
  getPendingRecordWriteCount,
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from './pendingRecordWrites';

const TEST_MODULE = 'test-module';

describe('pendingRecordWrites', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('no encola nada cuando el guardado tiene éxito', async () => {
    const save = vi.fn(async () => ({ ok: true, message: 'Guardado.', currentUpdatedAt: 't1' }));

    const result = await saveRecordWithPendingFallback({
      module: TEST_MODULE,
      recordId: 'rec-1',
      value: '{"a":1}',
      expectedUpdatedAt: null,
      save,
    });

    expect(result).toEqual({ ok: true, message: 'Guardado.', currentUpdatedAt: 't1' });
    expect(getPendingRecordWriteCount()).toBe(0);
  });

  it('encola el cambio cuando el fallo es de conectividad (SQLite no activo) y no lo pierde', async () => {
    const save = vi.fn(async () => ({
      ok: false,
      message: 'SQLite no está activo. No se permite guardar sin base compartida.',
      currentUpdatedAt: null,
    }));

    const result = await saveRecordWithPendingFallback({
      module: TEST_MODULE,
      recordId: 'rec-2',
      value: '{"a":2}',
      expectedUpdatedAt: null,
      save,
    });

    expect(result.ok).toBe(false);
    expect(result.queued).toBe(true);
    expect(result.message).toContain('ha quedado en cola local');
    expect(getPendingRecordWriteCount()).toBe(1);
  });

  it('encola el cambio cuando la llamada de guardado lanza una excepción (p.ej. IPC caído)', async () => {
    const save = vi.fn(async () => {
      throw new Error('No se ha podido contactar con el proceso principal.');
    });

    const result = await saveRecordWithPendingFallback({
      module: TEST_MODULE,
      recordId: 'rec-3',
      value: '{"a":3}',
      expectedUpdatedAt: null,
      save,
    });

    expect(result.ok).toBe(false);
    expect(result.queued).toBe(true);
    expect(getPendingRecordWriteCount()).toBe(1);
  });

  it('NO encola un conflicto real de concurrencia (otro usuario ya modificó el registro)', async () => {
    const save = vi.fn(async () => ({
      ok: false,
      message: 'El registro ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle.',
      currentUpdatedAt: 'other-token',
    }));

    const result = await saveRecordWithPendingFallback({
      module: TEST_MODULE,
      recordId: 'rec-4',
      value: '{"a":4}',
      expectedUpdatedAt: 'stale-token',
      save,
    });

    expect(result.ok).toBe(false);
    expect(result.queued).toBeUndefined();
    expect(getPendingRecordWriteCount()).toBe(0);
  });

  it('flushPendingRecordWrites reintenta contra el repositorio registrado y limpia la cola al tener éxito', async () => {
    const flushModule = 'flush-module';
    const replay = vi.fn(async (recordId: string, value: string, expectedUpdatedAt: string | null) => ({
      ok: true,
      message: 'Sincronizado.',
      currentUpdatedAt: 't2',
    }));
    registerPendingWriteReplayer(flushModule, replay);

    const failingSave = vi.fn(async () => ({
      ok: false,
      message: 'base ocupada temporalmente',
      currentUpdatedAt: null,
    }));

    await saveRecordWithPendingFallback({
      module: flushModule,
      recordId: 'rec-5',
      value: '{"a":5}',
      expectedUpdatedAt: null,
      save: failingSave,
    });
    expect(getPendingRecordWriteCount()).toBe(1);

    const flushedCount = await flushPendingRecordWrites();

    expect(flushedCount).toBe(1);
    expect(replay).toHaveBeenCalledWith('rec-5', '{"a":5}', null);
    expect(getPendingRecordWriteCount()).toBe(0);
  });

  it('flushPendingRecordWrites re-encola (no descarta) si el reintento vuelve a fallar por conectividad', async () => {
    const retryModule = 'retry-module';
    const replay = vi.fn(async () => ({
      ok: false,
      message: 'base ocupada temporalmente',
      currentUpdatedAt: null,
    }));
    registerPendingWriteReplayer(retryModule, replay);

    await saveRecordWithPendingFallback({
      module: retryModule,
      recordId: 'rec-6',
      value: '{"a":6}',
      expectedUpdatedAt: null,
      save: async () => ({ ok: false, message: 'base ocupada temporalmente', currentUpdatedAt: null }),
    });
    expect(getPendingRecordWriteCount()).toBe(1);

    const flushedCount = await flushPendingRecordWrites();

    expect(flushedCount).toBe(0);
    expect(getPendingRecordWriteCount()).toBe(1);
  });
});
