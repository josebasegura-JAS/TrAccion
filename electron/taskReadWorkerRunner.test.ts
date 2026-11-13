import { describe, expect, it, vi } from 'vitest';
import { isTaskReadWorkerRequest, isTaskReadWorkerResponse } from './taskReadWorkerProtocol.js';
import { runTaskReadWorker, type TaskReadChild } from './taskReadWorkerRunner.js';

const expected = { databaseUuid: 'db-test', applicationId: 'traccion', environment: 'test', schemaVersion: 1 };
const records = [{ id: 't1', value: '{"estado":"abierta"}', createdAt: '2026-11-13', updatedAt: '2026-11-13', deletedAt: null }];

function fakeChild() {
  let messageHandler: (v: unknown) => void = () => {};
  let exitHandler: (code: number) => void = () => {};
  const postMessage = vi.fn();
  const kill = vi.fn();
  const child: TaskReadChild = {
    postMessage, kill,
    onMessage: (fn) => { messageHandler = fn; },
    onExit: (fn) => { exitHandler = fn; },
  };
  return { child, postMessage, kill, send: (v: unknown) => messageHandler(v), exit: (code = 0) => exitHandler(code) };
}

describe('PR9D-4A · lectura aislada de Tareas', () => {
  it('rechaza mensajes arbitrarios y filtros incorrectos', () => {
    const base = { kind: 'tasks:read', databasePath: 'Z:/traccion.sqlite', expected, filter: { mode: 'active' } };
    expect(isTaskReadWorkerRequest(base)).toBe(true);
    expect(isTaskReadWorkerRequest({ ...base, kind: 'tasks:write' })).toBe(false);
    expect(isTaskReadWorkerRequest({ ...base, filter: { ids: Array(301).fill('x') } })).toBe(false);
    expect(isTaskReadWorkerRequest({ ...base, filter: { mode: 'invalido' } })).toBe(false);
    expect(isTaskReadWorkerResponse({ kind: 'tasks:result', records })).toBe(true);
    expect(isTaskReadWorkerResponse({ kind: 'tasks:result', records: [{ id: 5 }] })).toBe(false);
  });

  it('devuelve registros solo al confirmar la salida del proceso', async () => {
    const fake = fakeChild();
    let completed = false;
    const promise = runTaskReadWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected, filter: { mode: 'active' },
    }).then((result) => { completed = true; return result; });
    fake.send({ kind: 'tasks:ready' });
    expect(fake.postMessage).toHaveBeenCalledWith({
      kind: 'tasks:read', databasePath: 'Z:/traccion.sqlite', expected, filter: { mode: 'active' },
    });
    fake.send({ kind: 'tasks:result', records });
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'tasks:shutdown' });
    await Promise.resolve();
    expect(completed).toBe(false);
    fake.exit();
    expect(await promise).toEqual(records);
    expect(fake.kill).not.toHaveBeenCalled();
  });

  it('si no llega exit, timeout mantiene el resultado pendiente y solicita kill', async () => {
    vi.useFakeTimers();
    try {
      const fake = fakeChild();
      let completed = false;
      const promise = runTaskReadWorker({
        createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected, filter: {},
        timeoutMs: 3000,
      }).then(() => { completed = true; }, () => { completed = true; });
      fake.send({ kind: 'tasks:ready' });
      vi.advanceTimersByTime(3000);
      expect(fake.kill).toHaveBeenCalledOnce();
      await Promise.resolve();
      expect(completed).toBe(false);
      fake.send({ kind: 'tasks:result', records }); // demasiado tarde
      fake.exit(1);
      await promise;
      expect(completed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('no acepta un resultado cuando el hijo termina con error', async () => {
    const fake = fakeChild();
    const promise = runTaskReadWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected, filter: {},
    });
    fake.send({ kind: 'tasks:ready' });
    fake.send({ kind: 'tasks:result', records });
    fake.exit(1);
    await expect(promise).rejects.toThrow();
  });
});
