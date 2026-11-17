import { beforeEach, describe, expect, it, vi } from 'vitest';
import { basename } from 'node:path';

const electronFake = vi.hoisted(() => ({
  fork: vi.fn(),
  postMessage: vi.fn(),
  kill: vi.fn(() => true),
  listeners: new Map<string, (...values: unknown[]) => void>(),
}));
vi.mock('electron', () => ({
  utilityProcess: {
    fork: (entry: string, args: string[], options: { serviceName: string }) => {
      electronFake.fork(entry, args, options);
      return {
        postMessage: electronFake.postMessage,
        kill: electronFake.kill,
        on: (event: string, listener: (...values: unknown[]) => void) => {
          electronFake.listeners.set(event, listener);
        },
      };
    },
  },
}));

import { createExperimentalElectronDetachedWriterChild } from './detachedWriterElectronAdapter.js';

beforeEach(() => {
  electronFake.listeners.clear();
  electronFake.fork.mockClear();
  electronFake.postMessage.mockClear();
  electronFake.kill.mockClear();
});

describe('PR506 · adaptador real Electron del writer experimental', () => {
  it('lanza el script de writer con serviceName experimental, sin tocar producción', () => {
    createExperimentalElectronDetachedWriterChild();
    expect(electronFake.fork).toHaveBeenCalledOnce();
    const [entry, args, options] = electronFake.fork.mock.calls[0]!;
    expect(basename(entry as string)).toBe('detachedCriteriaWriterWorker.js');
    expect(args).toEqual([]);
    expect(options.serviceName).toContain('experimental');
  });

  it('transmite mensajes por utilityProcess y entrega solo event.data', () => {
    const child = createExperimentalElectronDetachedWriterChild();
    const receive = vi.fn();
    child.onMessage(receive);
    const request = { kind: 'detached:close' } as const;
    child.postMessage(request);
    expect(electronFake.postMessage).toHaveBeenCalledWith(request);
    electronFake.listeners.get('message')?.({ data: {kind:'detached:ready'} });
    expect(receive).toHaveBeenCalledWith({ kind: 'detached:ready' });
  });

  it('kill solicitado no equivale a EXIT; solo el evento nativo notifica salida', () => {
    const child = createExperimentalElectronDetachedWriterChild();
    const exit = vi.fn();
    child.onExit(exit);
    child.kill();
    expect(electronFake.kill).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    electronFake.listeners.get('exit')?.(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
