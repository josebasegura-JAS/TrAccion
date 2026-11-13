import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSqliteIntegrityWorkerRequest, isSqliteIntegrityWorkerResponse } from './sqliteIntegrityWorkerProtocol.js';
import { runSqliteIntegrityWorker, type SqliteIntegrityChild } from './sqliteIntegrityWorkerRunner.js';

const expected = {
  databaseUuid: 'id-prueba', applicationId: 'traccion', environment: 'test', schemaVersion: 1,
};

function fakeChild() {
  let deliver: (message: unknown) => void = () => {};
  let signalExit: (code: number) => void = () => {};
  const postMessage = vi.fn();
  const kill = vi.fn();
  const child: SqliteIntegrityChild = {
    postMessage, kill,
    onMessage: (callback) => { deliver = callback; },
    onExit: (callback) => { signalExit = callback; },
  };
  return { child, postMessage, kill, send: (message: unknown) => deliver(message), exit: (code = 0) => signalExit(code) };
}

afterEach(() => vi.useRealTimers());

describe('PR9D · protocolo de preflight SQLite aislado', () => {
  it('solo admite verificación con identidad completa, sin mensajes de escritura', () => {
    expect(isSqliteIntegrityWorkerRequest({ kind: 'integrity:verify', databasePath: 'Z:/traccion.sqlite', expected })).toBe(true);
    expect(isSqliteIntegrityWorkerRequest({ kind: 'integrity:verify', databasePath: '', expected })).toBe(false);
    expect(isSqliteIntegrityWorkerRequest({ kind: 'sqlite:write', databasePath: 'Z:/traccion.sqlite', expected })).toBe(false);
    expect(isSqliteIntegrityWorkerRequest({ kind: 'integrity:shutdown' })).toBe(true);
    expect(isSqliteIntegrityWorkerResponse({ kind: 'integrity:ready' })).toBe(true);
    expect(isSqliteIntegrityWorkerResponse({ kind: 'integrity:verified' })).toBe(true);
    expect(isSqliteIntegrityWorkerResponse({ kind: 'integrity:rejected' })).toBe(true);
    expect(isSqliteIntegrityWorkerResponse({ kind: 'integrity:verified', sql: 'UPDATE users' })).toBe(true);
    expect(isSqliteIntegrityWorkerResponse(null)).toBe(false);
  });
});

describe('PR9D · fin de vida y reconexión fail-closed', () => {
  it('espera handshake y exit ANTES de considerar segura la reapertura', async () => {
    vi.useFakeTimers();
    const fake = fakeChild();
    const settled = vi.fn();
    const job = runSqliteIntegrityWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected, timeoutMs: 5_000,
    }).then(settled);
    expect(fake.postMessage).not.toHaveBeenCalled();
    fake.send({ kind: 'integrity:ready' });
    expect(fake.postMessage).toHaveBeenCalledWith({
      kind: 'integrity:verify', databasePath: 'Z:/traccion.sqlite', expected,
    });
    fake.send({ kind: 'integrity:verified' });
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'integrity:shutdown' });
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    fake.exit(0);
    await job;
    expect(settled).toHaveBeenCalledTimes(1);
    expect(fake.kill).not.toHaveBeenCalled();
  });

  it('no desbloquea si el worker informa que la identidad no coincide', async () => {
    const fake = fakeChild();
    const job = runSqliteIntegrityWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected,
    });
    fake.send({ kind: 'integrity:ready' });
    fake.send({ kind: 'integrity:rejected' });
    fake.exit();
    await expect(job).rejects.toThrow('No se ha podido verificar');
  });

  it('timeout solicita terminación, pero no resuelve ni rechaza antes de exit', async () => {
    vi.useFakeTimers();
    const fake = fakeChild();
    const settled = vi.fn();
    const job = runSqliteIntegrityWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected,
      timeoutMs: 4_000,
    }).then(() => settled('ok'), () => settled('error'));
    fake.send({ kind: 'integrity:ready' });
    vi.advanceTimersByTime(4_000);
    expect(fake.kill).toHaveBeenCalledTimes(1);
    fake.send({ kind: 'integrity:verified' }); // demasiado tarde
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    fake.exit(1);
    await job;
    expect(settled).toHaveBeenCalledWith('error');
  });

  it('PR9D-2: envía modo health sin SQL arbitrario y no completa antes de exit', async () => {
    const fake = fakeChild();
    let settled = false;
    const job = runSqliteIntegrityWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected, mode: 'health',
    }).then(() => { settled = true; });
    fake.send({ kind: 'integrity:ready' });
    expect(fake.postMessage).toHaveBeenCalledWith({
      kind: 'integrity:verify', databasePath: 'Z:/traccion.sqlite', expected, mode: 'health',
    });
    fake.send({ kind: 'integrity:verified' });
    await Promise.resolve();
    expect(settled).toBe(false);
    fake.exit(0);
    await job;
    expect(settled).toBe(true);
  });

  it('si termina sin respuesta, bloquea aunque exit code sea 0', async () => {
    const fake = fakeChild();
    const job = runSqliteIntegrityWorker({
      createChild: () => fake.child, databasePath: 'Z:/traccion.sqlite', expected,
    });
    fake.exit(0);
    await expect(job).rejects.toThrow('No se ha podido verificar');
  });
});
