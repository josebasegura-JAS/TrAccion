import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock('electron', () => ({ utilityProcess: { fork: mocks.fork } }));

import { verifyIntegrityInWorker } from './sqliteIntegrityWorkerClient.js';

const identity = { databaseUuid: 'test-uuid', applicationId: 'TrAccion', environment: 'test', schemaVersion: 1 };
function fakeChild() {
  const child = Object.assign(new EventEmitter(), { postMessage: vi.fn(), kill: vi.fn() });
  mocks.fork.mockReturnValue(child);
  return child;
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('SQLite integrity worker client', () => {
  it('rejects production before starting a process', async () => {
    await expect(verifyIntegrityInWorker('db', { ...identity, environment: 'production' })).rejects.toThrow('pruebas');
    expect(mocks.fork).not.toHaveBeenCalled();
  });

  it('waits for actual process exit after successful verification', async () => {
    const child = fakeChild();
    const completed = vi.fn();
    const operation = verifyIntegrityInWorker('db', identity).then(completed);
    expect(child.postMessage).toHaveBeenCalledWith({ kind: 'engine:request', id: 1, operation: 'verify-integrity', args: ['db', identity] });
    child.emit('message', { kind: 'engine:result', id: 1, value: true });
    await Promise.resolve();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    child.emit('exit', 0);
    await operation;
    expect(completed).toHaveBeenCalledTimes(1);
  });

  it('does not authorize reopening after a timeout', async () => {
    vi.useFakeTimers();
    const child = fakeChild();
    const operation = verifyIntegrityInWorker('db', identity);
    const rejected = expect(operation).rejects.toThrow('no confirmado');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(child.kill).toHaveBeenCalledTimes(1);
    child.emit('exit', 1);
    await rejected;
  });

  it('rejects on unexpected process exit', async () => {
    const child = fakeChild();
    const rejected = expect(verifyIntegrityInWorker('db', identity)).rejects.toThrow('ha salido');
    child.emit('exit', 1);
    await rejected;
    expect(child.kill).not.toHaveBeenCalled();
  });
});
