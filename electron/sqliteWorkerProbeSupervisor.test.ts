import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isSqliteWorkerProbeRequest,
  isSqliteWorkerProbeResponse,
} from './sqliteWorkerProbeProtocol.js';
import {
  startSqliteWorkerProbeSupervisor,
  type SqliteProbeChild,
  type SqliteProbeState,
} from './sqliteWorkerProbeSupervisor.js';

function fakeChild() {
  let onMessage: (data: unknown) => void = () => {};
  let onExit: (code: number) => void = () => {};
  const postMessage = vi.fn();
  const kill = vi.fn(() => true);
  const child: SqliteProbeChild = {
    postMessage,
    kill,
    onMessage: (handler) => { onMessage = handler; },
    onExit: (handler) => { onExit = handler; },
  };
  return {
    child, postMessage, kill,
    send: (data: unknown) => onMessage(data),
    exit: (code = 0) => onExit(code),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('PR9C · protocolo limitado del proceso auxiliar', () => {
  it('solo admite ping, shutdown, ready y pong con identificadores enteros positivos', () => {
    expect(isSqliteWorkerProbeRequest({ kind: 'probe:ping', id: 1 })).toBe(true);
    expect(isSqliteWorkerProbeRequest({ kind: 'probe:shutdown' })).toBe(true);
    expect(isSqliteWorkerProbeRequest({ kind: 'sqlite:write', id: 1 })).toBe(false);
    expect(isSqliteWorkerProbeRequest({ kind: 'probe:ping', id: -1 })).toBe(false);
    expect(isSqliteWorkerProbeResponse({ kind: 'probe:ready' })).toBe(true);
    expect(isSqliteWorkerProbeResponse({ kind: 'probe:pong', id: 2 })).toBe(true);
    expect(isSqliteWorkerProbeResponse({ kind: 'probe:pong', id: 2.5 })).toBe(false);
    expect(isSqliteWorkerProbeResponse(null)).toBe(false);
  });
});

describe('PR9C · supervisión sin SQLite', () => {
  it('recibe ready y valida correlación del ping sin bloquear el siguiente', () => {
    vi.useFakeTimers();
    const fake = fakeChild();
    const states: SqliteProbeState[] = [];
    const probe = startSqliteWorkerProbeSupervisor({
      createChild: () => fake.child,
      onState: (value) => states.push(value),
      intervalMs: 1000,
      timeoutMs: 3000,
    });
    fake.send({ kind: 'probe:ready' });
    expect(probe.getState()).toBe('ready');
    vi.advanceTimersByTime(1000);
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'probe:ping', id: 1 });
    fake.send({ kind: 'probe:pong', id: 999 }); // respuesta incorrecta
    vi.advanceTimersByTime(1000);
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    fake.send({ kind: 'probe:pong', id: 1 });
    vi.advanceTimersByTime(1000);
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'probe:ping', id: 2 });
    expect(states).toEqual(['ready']);
    probe.stop();
    fake.exit();
    expect(probe.getState()).toBe('stopped');
  });

  it('ante timeout solicita kill una vez y jamás supone salida hasta exit', () => {
    vi.useFakeTimers();
    const fake = fakeChild();
    const states: SqliteProbeState[] = [];
    const probe = startSqliteWorkerProbeSupervisor({
      createChild: () => fake.child,
      onState: (value) => states.push(value),
      intervalMs: 1000,
      timeoutMs: 3000,
    });
    vi.advanceTimersByTime(1000);
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'probe:ping', id: 1 });
    vi.advanceTimersByTime(3000);
    expect(fake.kill).toHaveBeenCalledTimes(1);
    expect(probe.getState()).toBe('unresponsive');
    vi.advanceTimersByTime(10_000);
    expect(fake.kill).toHaveBeenCalledTimes(1);
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    fake.exit(1);
    expect(probe.getState()).toBe('exited');
    expect(states).toEqual(['unresponsive', 'exited']);
  });

  it('al cerrar elimina el timer y espera confirmación de exit', () => {
    vi.useFakeTimers();
    const fake = fakeChild();
    const probe = startSqliteWorkerProbeSupervisor({
      createChild: () => fake.child, onState: vi.fn(),
      intervalMs: 1000, timeoutMs: 3000,
    });
    probe.stop();
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'probe:shutdown' });
    expect(fake.kill).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(20_000);
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    expect(probe.getState()).toBe('starting'); // kill() no confirma salida
    fake.exit();
    expect(probe.getState()).toBe('stopped');
  });
});
