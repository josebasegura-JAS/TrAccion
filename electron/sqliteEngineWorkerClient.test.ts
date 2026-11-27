import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startIsolatedTestEngine } from './sqliteEngineWorkerClient.js';
import { SQLITE_ENGINE_REQUEST_TIMEOUT_MS } from './sqliteEngineSafety.js';

const mocks = vi.hoisted(() => ({ fork: vi.fn(), metrics: vi.fn() }));
vi.mock('electron', () => ({ utilityProcess: { fork: mocks.fork } }));
vi.mock('./multiuserPerformanceDiagnostics.js', () => ({ ingestMultiuserMetricSamples: mocks.metrics }));

class FakeChild extends EventEmitter {
  postMessage = vi.fn();
  send(message: unknown) { this.emit('message', message); }
  exit(code: number) { this.emit('exit', code); }
}

let child: FakeChild;
const zero = { activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0 };

beforeEach(() => {
  vi.useFakeTimers();
  child = new FakeChild();
  mocks.fork.mockReset().mockReturnValue(child);
  mocks.metrics.mockClear();
});
afterEach(() => { vi.useRealTimers(); });

describe('T1: supervisor del proceso SQLite', () => {
  it('no envía operaciones hasta confirmar el arranque y transmite el entorno explícito', async () => {
    const engine = startIsolatedTestEngine('/profile-test', undefined, undefined, 'test');
    const result = engine.callExtra('read', []);
    expect(child.postMessage).not.toHaveBeenCalled();
    expect(mocks.fork).toHaveBeenCalledWith(expect.any(String),
      ['--traccion-env=test', '--sqlite-user-data=/profile-test'], expect.any(Object));
    child.send({ kind: 'engine:ready' });
    await Promise.resolve();
    expect(child.postMessage).toHaveBeenCalledWith({ kind: 'engine:request', id: 1, operation: 'read', args: [] });
    child.send({ kind: 'engine:result', id: 1, value: 42 });
    await expect(result).resolves.toBe(42);
  });

  it('bloquea el arranque no confirmado aunque después llegue ready', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    const failure = expect(engine.callExtra('write', [])).rejects.toThrow('no confirmó su arranque');
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
    child.send({ kind: 'engine:ready' });
    await expect(engine.callExtra('write', [])).rejects.toThrow('no confirmó su arranque');
    expect(child.postMessage).not.toHaveBeenCalled();
  });

  it('rechaza salida antes de ready y no envía ninguna petición', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    const failure = expect(engine.callExtra('write', [])).rejects.toThrow('antes de confirmar');
    child.exit(1);
    await failure;
    expect(await engine.exited).toBe(1);
    expect(engine.hasExited()).toBe(true);
    expect(child.postMessage).not.toHaveBeenCalled();
  });

  it('clasifica salida durante escritura como no recuperable en reposo', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    child.send({ kind: 'engine:ready' });
    const failure = expect(engine.callExtra('write', [])).rejects.toThrow('no confirmado');
    await Promise.resolve();
    expect(engine.getState()).toBe('busy');
    child.exit(1);
    await failure;
    expect(engine.exitedWhileIdle()).toBe(false);
    expect(engine.getState()).toBe('exited');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('una respuesta tardía no convierte un timeout en salida segura', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    child.send({ kind: 'engine:ready' });
    const failure = expect(engine.callExtra('write', [])).rejects.toThrow('no confirmado');
    await vi.advanceTimersByTimeAsync(SQLITE_ENGINE_REQUEST_TIMEOUT_MS);
    await failure;
    child.send({ kind: 'engine:result', id: 1, value: true });
    child.exit(1);
    expect(engine.exitedWhileIdle()).toBe(false);
    expect(child.postMessage).toHaveBeenCalledTimes(1);
  });

  it('notifica cambios de backup sin RPC y rechaza estados malformados', async () => {
    const backups = vi.fn();
    const engine = startIsolatedTestEngine('/profile-test', undefined, undefined, 'test', backups);
    child.send({ kind: 'engine:ready' });
    await engine.ready;
    child.send({ kind: 'engine:backups', backups: { ...zero, activeBackupOperations: 1 } });
    child.send({ kind: 'engine:backups', backups: { ...zero, queuedBackupOperations: -1 } });
    child.send({ kind: 'engine:backups', backups: zero });
    expect(backups.mock.calls).toEqual([[{ ...zero, activeBackupOperations: 1 }], [undefined], [zero]]);
    expect(child.postMessage).not.toHaveBeenCalled();
  });

  it('reintenta únicamente la orden de salida si el cierre de SQLite ya fue confirmado', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    child.send({ kind: 'engine:ready' });
    const failure = expect(engine.close()).rejects.toThrow('no confirmó su salida');
    await Promise.resolve();
    child.send({ kind: 'engine:result', id: 1, value: { totalMs: 10 } });
    await vi.advanceTimersByTimeAsync(15_000);
    await failure;
    await expect(engine.callExtra('write', [])).rejects.toThrow('en cierre');
    const retry = engine.close();
    await Promise.resolve();
    child.exit(0);
    await expect(retry).resolves.toEqual({ totalMs: 10 });
    expect(child.postMessage.mock.calls).toEqual([
      [{ kind: 'engine:request', id: 1, operation: 'closeSqlitePersistence', args: [] }],
      ['engine:shutdown'], ['engine:shutdown'],
    ]);
  });

  it('no certifica como limpio un cierre con código de salida distinto de cero', async () => {
    const engine = startIsolatedTestEngine('/profile-test');
    child.send({ kind: 'engine:ready' });
    const failure = expect(engine.close()).rejects.toThrow('Salida SQLite no limpia: 2');
    await Promise.resolve();
    child.send({ kind: 'engine:result', id: 1, value: { totalMs: 10 } });
    await Promise.resolve();
    child.exit(2);
    await failure;
    expect(engine.hasExited()).toBe(true);
  });
});
