import { describe, expect, it, vi } from 'vitest';
import { createSupervisedDetachedWriterSession, type SupervisedDetachedChild } from './supervisedDetachedWriterSession.js';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';

const expected = { databaseUuid: 'database-1', applicationId: 'traccion',
  environment: 'test', schemaVersion: 1 };
const proof = { ownerId: 'detached-writer:100:uuid', hostname: 'WIN-A',
  pid: 100, createdAt: '2026-11-17T08:00:00.000Z' };

function fixture() {
  let messageHandler: (value: unknown) => void = () => undefined;
  let exitHandler: (code: number) => void = () => undefined;
  const postMessage = vi.fn<(message: DetachedWriterRequest) => void>();
  const kill = vi.fn();
  const child: SupervisedDetachedChild = {
    postMessage,
    onMessage(handler) { messageHandler = handler; },
    onExit(handler) { exitHandler = handler; },
    kill,
  };
  const verifyOwnership = vi.fn(async () => undefined);
  const onUncertain = vi.fn();
  const onExitConfirmed = vi.fn();
  const session = createSupervisedDetachedWriterSession({
    createChild: () => child, databasePath: 'X:/db.sqlite', expected,
    verifyOwnership, onUncertain, onExitConfirmed,
  });
  return {
    session, postMessage, kill, verifyOwnership, onUncertain, onExitConfirmed,
    message: (value: unknown) => messageHandler(value),
    exit: (code: number) => exitHandler(code),
  };
}
describe('PR481 · supervised detached writer handshake', () => {
  it('confirms a matching generation only after independently checking SMB ownership', async () => {
    const f = fixture();
    const start = f.session.startWriter(11);
    f.message({ kind: 'detached:ready' });
    expect(f.postMessage).toHaveBeenCalledWith({
      kind: 'detached:open-session', databasePath: 'X:/db.sqlite', expected, generation: 11,
    });
    f.message({ kind: 'detached:session-opened', generation: 11, proof });
    await expect(start).resolves.toEqual({ generation: 11 });
    expect(f.session.snapshot()).toMatchObject({ generation: 11, verified: false });
    await f.session.verifyWorkerSmbOwnership(11);
    expect(f.verifyOwnership).toHaveBeenCalledWith(proof);
    expect(f.session.snapshot()).toMatchObject({ verified: true });
  });

  it('rejects mismatched generation and never silently returns to main', async () => {
    const f = fixture();
    const start = f.session.startWriter(4);
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:session-opened', generation: 5, proof });
    await expect(start).rejects.toThrow('generación');
    expect(f.kill).toHaveBeenCalledTimes(1);
    expect(f.onUncertain).toHaveBeenCalledWith(4);
    await expect(f.session.verifyWorkerSmbOwnership(4)).rejects.toThrow('pendiente');
  });

  it('rejects a worker exit before opening, without accepting a delayed ACK', async () => {
    const f = fixture();
    const start = f.session.startWriter(3);
    f.message({ kind: 'detached:ready' });
    f.exit(1);
    await expect(start).rejects.toThrow('terminó');
    f.message({ kind: 'detached:session-opened', generation: 3, proof });
    expect(f.onExitConfirmed).toHaveBeenCalledWith(3, 1);
    expect(f.session.snapshot()).toMatchObject({ exited: true, verified: false });
  });

  it('quarantines a failed SMB proof rather than allowing a verified session', async () => {
    const f = fixture();
    const start = f.session.startWriter(7);
    f.message({ kind: 'detached:ready' });
    f.message({ kind: 'detached:session-opened', generation: 7, proof });
    await start;
    f.verifyOwnership.mockRejectedValue(new Error('SMB offline'));
    await expect(f.session.verifyWorkerSmbOwnership(7)).rejects.toThrow('SMB offline');
    expect(f.onUncertain).toHaveBeenCalledWith(7);
    expect(f.kill).toHaveBeenCalledTimes(1);
    expect(f.session.snapshot()).toMatchObject({ verified: false });
  });
});
