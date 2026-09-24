import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushPendingRecordWrites,
  getPendingRecordWriteCount,
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from './pendingRecordWrites';
import { SQLITE_PENDING_RECORD_WRITES_KEY } from './persistenceKeys';

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

  it('rechaza el cambio y no lo encola cuando SQLite no está activa', async () => {
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
    expect(result.queued).toBe(false);
    expect(result.message).toContain('NO se ha guardado localmente');
    expect(getPendingRecordWriteCount()).toBe(0);
  });

  it('rechaza el cambio sin encolarlo cuando la llamada de guardado lanza una excepción', async () => {
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
    expect(result.queued).toBe(false);
    expect(result.message).toContain('NO se ha guardado localmente');
    expect(getPendingRecordWriteCount()).toBe(0);
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

  it('purga una cola heredada sin reproducirla contra el repositorio', async () => {
    const replay = vi.fn(async () => ({
      ok: true,
      message: 'Sincronizado.',
      currentUpdatedAt: 't2',
    }));
    registerPendingWriteReplayer('legacy-module', replay);

    window.localStorage.setItem(SQLITE_PENDING_RECORD_WRITES_KEY, JSON.stringify([{
      module: 'legacy-module',
      recordId: 'rec-5',
      value: '{"a":5}',
      expectedUpdatedAt: null,
      queuedAt: new Date().toISOString(),
      attempts: 1,
      lastError: 'offline',
    }]));

    const flushedCount = await flushPendingRecordWrites();

    expect(flushedCount).toBe(0);
    expect(replay).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SQLITE_PENDING_RECORD_WRITES_KEY)).toBeNull();
    expect(getPendingRecordWriteCount()).toBe(0);
  });

});
