import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  saveCriteriaViaDetachedWriter,
  type DetachedWriterChild,
} from './detachedCriteriaWriterRunner.js';
import type {
  DetachedWriterRequest,
} from './detachedCriteriaWriterProtocol.js';

const expected = {
  databaseUuid: 'db-test-001',
  applicationId: 'TrAccion',
  environment: 'production',
  schemaVersion: 1,
};
const record = {
  id: 'criterio-1',
  expectedUpdatedAt: null,
  value: JSON.stringify({ id: 'criterio-1', updatedAt: '2026-11-13T11:00:00Z' }),
};

function fixture() {
  let messageHandler: ((message: unknown) => void) | null = null;
  let exitHandler: ((code: number) => void) | null = null;
  const requests: DetachedWriterRequest[] = [];
  const kill = vi.fn();
  const child: DetachedWriterChild = {
    postMessage: message => { requests.push(message); },
    onMessage: handler => { messageHandler = handler; },
    onExit: handler => { exitHandler = handler; },
    kill,
  };
  const run = (timeoutMs = 20_000) => saveCriteriaViaDetachedWriter({
    createChild: () => child,
    databasePath: 'test-database.sqlite',
    expected,
    operationId: 'save-01',
    record,
    timeoutMs,
  });
  const message = (value: unknown): void => { messageHandler?.(value); };
  const exit = (code: number): void => { exitHandler?.(code); };
  return { requests, kill, child, run, message, exit };
}
afterEach(() => vi.useRealTimers());

describe('Proceso escritor aislado: controlador del ciclo de vida', () => {
  it('abre → escribe → cierra y solo confirma el resultado después de exit(0)', async () => {
    const f = fixture();
    let resolved = false;
    const job = f.run().then(result => { resolved = true; return result; });
    f.message({ kind: 'detached:ready' });
    expect(f.requests[0]).toEqual({ kind: 'detached:open', databasePath: 'test-database.sqlite', expected });
    f.message({ kind: 'detached:opened' });
    expect(f.requests[1]).toEqual({ kind: 'detached:save', operationId: 'save-01', record });
    f.message({ kind: 'detached:saved', operationId: 'save-01', result: { ok: true, updatedAt: 'v1' } });
    expect(f.requests[2]).toEqual({ kind: 'detached:close' });
    f.message({ kind: 'detached:closed' });
    await Promise.resolve();
    expect(resolved).toBe(false);
    f.exit(0);
    expect(await job).toEqual({ ok: true, updatedAt: 'v1' });
  });

  it('devuelve conflicto OCC confirmado sin reintentar la escritura', async () => {
    const f = fixture();
    const job = f.run();
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:opened' });
    f.message({ kind: 'detached:saved', operationId: 'save-01',
      result: { ok: false, conflict: true, currentUpdatedAt: 'v0' } });
    f.exit(0);
    expect(await job).toEqual({ ok: false, conflict: true, currentUpdatedAt: 'v0' });
    expect(f.requests.filter(x => x.kind === 'detached:save')).toHaveLength(1);
  });

  it('si el hijo sale después del guardado pero con código no cero, no confirma éxito', async () => {
    const f = fixture();
    const job = f.run();
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:opened' });
    f.message({ kind: 'detached:saved', operationId: 'save-01', result: { ok: true, updatedAt: 'v1' } });
    f.exit(1);
    await expect(job).rejects.toThrow('comprobar el registro');
  });

  it('rechaza respuesta de otro operationId y espera exit antes de liberar', async () => {
    const f = fixture();
    let completed = false;
    const job = f.run().catch(() => { completed = true; });
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:opened' });
    f.message({ kind: 'detached:saved', operationId: 'save-old', result: { ok: true, updatedAt: 'v1' } });
    expect(f.kill).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(completed).toBe(false);
    f.exit(1);
    await job;
    expect(completed).toBe(true);
  });

  it('ante timeout no reintenta ni acepta respuestas tardías', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const job = f.run(100);
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:opened' });
    await vi.advanceTimersByTimeAsync(101);
    expect(f.kill).toHaveBeenCalledTimes(1);
    f.message({ kind: 'detached:saved', operationId: 'save-01', result: { ok: true, updatedAt: 'v1' } });
    f.exit(0);
    await expect(job).rejects.toThrow('resultado incierto');
    expect(f.requests.filter(x => x.kind === 'detached:save')).toHaveLength(1);
  });

  it('no crea proceso para parámetros de entrada inválidos', async () => {
    const createChild = vi.fn(() => fixture().child);
    await expect(saveCriteriaViaDetachedWriter({
      createChild, databasePath: ' ', expected, operationId: 'op',
      record,
    })).rejects.toThrow('Ruta');
    expect(createChild).not.toHaveBeenCalled();
  });
});
