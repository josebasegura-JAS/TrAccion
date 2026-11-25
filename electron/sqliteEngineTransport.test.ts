import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createEngineClient, createEngineDispatcher, isEngineRequest, isEngineResponse,
  type EngineOperation, type EngineTransport,
} from './sqliteEngineTransport.js';

function fakeTransport() {
  let message: (value: unknown) => void = () => {};
  let exit: (code: number) => void = () => {};
  const postMessage = vi.fn();
  const transport: EngineTransport = {
    postMessage,
    onMessage: (handler) => { message = handler; },
    onExit: (handler) => { exit = handler; },
  };
  return { transport, postMessage, send: (value: unknown) => message(value), exit: () => exit(1) };
}

afterEach(() => vi.useRealTimers());

describe('SQLite engine transport', () => {
  it('correlates replies and admits just one operation', async () => {
    const fake = fakeTransport();
    const client = createEngineClient(fake.transport);
    const result = client.call('read', [7]);
    expect(fake.postMessage).toHaveBeenCalledWith({ kind: 'engine:request', id: 1, operation: 'read', args: [7] });
    await expect(client.call('write')).rejects.toThrow('busy');
    fake.send({ kind: 'engine:result', id: 99, value: 0 });
    fake.send({ kind: 'engine:result', id: 1 });
    expect(client.getState()).toBe('busy');
    fake.send({ kind: 'engine:result', id: 1, value: 7 });
    await expect(result).resolves.toBe(7);
    expect(client.getState()).toBe('idle');
    const second = client.call('read');
    fake.send({ kind: 'engine:error', id: 2, message: 'fallo' });
    await expect(second).rejects.toThrow('fallo');
    expect(client.getState()).toBe('idle');
  });

  it('quarantines the channel on timeout even when a late reply arrives', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const client = createEngineClient(fake.transport);
    const result = expect(client.call('write', [], 100)).rejects.toThrow('no confirmado');
    await vi.advanceTimersByTimeAsync(100);
    await result;
    fake.send({ kind: 'engine:result', id: 1, value: true });
    await expect(client.call('write')).rejects.toThrow('uncertain');
    expect(fake.postMessage).toHaveBeenCalledTimes(1);
    fake.exit();
    expect(client.getState()).toBe('exited');
    await expect(client.call('read')).rejects.toThrow('exited');
  });

  it('rejects a pending call on process exit and cancels its timer', async () => {
    vi.useFakeTimers();
    const fake = fakeTransport();
    const client = createEngineClient(fake.transport);
    const result = expect(client.call('read')).rejects.toThrow('ha salido');
    fake.exit();
    await result;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(client.getState()).toBe('exited');
  });

  it('does not retry a failed send and rejects invalid parameters', async () => {
    const fake = fakeTransport();
    const client = createEngineClient(fake.transport);
    await expect(client.call('read', [], 0)).rejects.toThrow('inválido');
    await expect(client.call('')).rejects.toThrow('vacía');
    expect(fake.postMessage).not.toHaveBeenCalled();
    fake.postMessage.mockImplementationOnce(() => { throw new Error('closed'); });
    await expect(client.call('write')).rejects.toThrow('no confirmado');
    expect(client.getState()).toBe('uncertain');
  });

  it('validates envelopes and only dispatches explicitly allowed operations', async () => {
    const dispatch = createEngineDispatcher(new Map<string, EngineOperation>([
      ['echo', (value) => value],
      ['fail', () => { throw new Error('fallo'); }],
      ['nonError', () => { throw 'fallo'; }],
    ]));
    const req = (operation: string, args: unknown[] = []) => ({ kind: 'engine:request', id: 1, operation, args });
    expect(isEngineRequest(null)).toBe(false);
    expect(isEngineRequest(req(''))).toBe(false);
    expect(isEngineRequest({ ...req('echo'), id: -1 })).toBe(false);
    expect(isEngineRequest({ ...req('echo'), args: null })).toBe(false);
    expect(isEngineResponse({ kind: 'engine:error', id: 1, message: 2 })).toBe(false);
    await expect(dispatch(null)).resolves.toBeUndefined();
    await expect(dispatch(req('constructor'))).resolves.toMatchObject({ kind: 'engine:error' });
    await expect(dispatch(req('echo', [42]))).resolves.toEqual({ kind: 'engine:result', id: 1, value: 42 });
    await expect(dispatch(req('fail'))).resolves.toMatchObject({ message: 'fallo' });
    await expect(dispatch(req('nonError'))).resolves.toMatchObject({ message: 'fallo' });
  });

  it('does not execute a second operation while the first remains active', async () => {
    let release: (value: unknown) => void = () => {};
    const handler = vi.fn(() => new Promise<unknown>((resolve) => { release = resolve; }));
    const dispatch = createEngineDispatcher(new Map<string, EngineOperation>([['write', handler]]));
    const first = dispatch({ kind: 'engine:request', id: 1, operation: 'write', args: [] });
    await expect(dispatch({ kind: 'engine:request', id: 2, operation: 'write', args: [] })).resolves.toMatchObject({ message: 'Motor ocupado' });
    expect(handler).toHaveBeenCalledTimes(1);
    release(true);
    await expect(first).resolves.toMatchObject({ value: true });
  });
});
