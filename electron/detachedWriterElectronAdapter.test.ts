import { beforeEach, describe, expect, it, vi } from 'vitest';
import { basename, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const electronFake = vi.hoisted(() => ({
  fork: vi.fn<(entry: string, args: string[], options: { serviceName: string }) => void>(),
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
import { createDetachedWriterLifecycleSupervisor } from './detachedWriterLifecycleSupervisor.js';
import { createDetachedWriterProcessStore } from './detachedWriterProcessStore.js';

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
    expect(basename(entry)).toBe('detachedCriteriaWriterWorker.js');
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

  it('conecta adaptador y supervisor, confirma EXIT antes de persistir tombstone', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'traccion-pr506-electron-'));
    try {
      const store = createDetachedWriterProcessStore(join(directory, 'writer.json'));
      const expected = {
        databaseUuid: 'experimental-db', applicationId: 'TrAccion',
        environment: 'test', schemaVersion: 1,
      };
      const verify = vi.fn(async () => undefined);
      const uncertain = vi.fn();
      const observedExit = vi.fn();
      const supervisor = createDetachedWriterLifecycleSupervisor({
        databasePath: 'X:/experimental.sqlite',
        expected,
        store,
        createChild: createExperimentalElectronDetachedWriterChild,
        verifyOwnership: verify,
        onUncertain: uncertain,
        onExitConfirmed: observedExit,
      });
      const starting = supervisor.start(6);
      expect(store.inspect()).toMatchObject({ state: 'launching', generation: 6 });
      electronFake.listeners.get('message')?.({ data: { kind: 'detached:ready' } });
      expect(electronFake.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'detached:open-session', generation: 6 }),
      );
      const proof = {
        ownerId:'detached-writer:42:test', hostname:'TEST-PC', pid:42,
        createdAt:'2026-11-17T10:00:00Z',
      };
      electronFake.listeners.get('message')?.({
        data: { kind:'detached:session-opened', generation:6, proof },
      });
      await starting;
      expect(verify).toHaveBeenCalledWith(proof);
      expect(supervisor.snapshot().verified).toBe(true);

      supervisor.requestStop();
      expect(electronFake.kill).toHaveBeenCalledOnce();
      expect(store.inspect()?.state).toBe('launching');
      let completed = false;
      const waiting = supervisor.waitForConfirmedExit().then(() => { completed = true; });
      await Promise.resolve();
      expect(completed).toBe(false);
      electronFake.listeners.get('exit')?.(1);
      await waiting;
      expect(store.inspect()).toMatchObject({state:'exit-confirmed',exitCode:1});
      expect(observedExit).toHaveBeenCalledWith(6,1);
      expect(supervisor.snapshot().verified).toBe(false);
    } finally {
      rmSync(directory,{recursive:true,force:true});
    }
  });

  it('kill solicitado no equivale a EXIT; solo el evento nativo notifica salida', () => {
    const child = createExperimentalElectronDetachedWriterChild();
    const exit = vi.fn();
    child.onExit(exit);
    child.kill();
    expect(electronFake.kill).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    electronFake.listeners.get('exit')?.(1);
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
