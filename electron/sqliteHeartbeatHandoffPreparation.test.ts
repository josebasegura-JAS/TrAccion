import { describe, expect, it, vi } from 'vitest';
import { createSqliteHeartbeatHandoffPreparation } from './sqliteHeartbeatHandoffPreparation.js';

function fixture() {
  const events: string[] = [];
  let finishPause: (() => void) | null = null;
  const pauseHeartbeatAndDrain = vi.fn(() => {
    events.push('pause');
    return new Promise<void>(resolve => { finishPause = resolve; });
  });
  const resumeHeartbeat = vi.fn(() => { events.push('resume'); });
  const freezeAndDrainOtherActivity = vi.fn(async () => { events.push('freeze'); return 7; });
  const abortOtherActivityFreeze = vi.fn((ticket: number) => { expect(ticket).toBe(7); events.push('abort'); });
  const controller = createSqliteHeartbeatHandoffPreparation({
    pauseHeartbeatAndDrain, resumeHeartbeat, freezeAndDrainOtherActivity, abortOtherActivityFreeze,
  });
  return { events, pauseHeartbeatAndDrain, resumeHeartbeat, freezeAndDrainOtherActivity,
    abortOtherActivityFreeze, controller, endPause: () => { if (finishPause) finishPause(); } };
}

describe('PR9D-5E · pausa y drenaje ordenado del heartbeat', () => {
  it('primero espera la renovación en curso, después congela y drena las demás rutas', async () => {
    const f = fixture();
    let completed = false;
    const job = f.controller.prepare().then(ticket => { completed = true; return ticket; });
    expect(f.events).toEqual(['pause']);
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(f.freezeAndDrainOtherActivity).not.toHaveBeenCalled();
    f.endPause();
    const ticket = await job;
    expect(ticket).toBe(7);
    expect(f.events).toEqual(['pause', 'freeze']);
    f.controller.assertPrepared(ticket);
    expect(f.resumeHeartbeat).not.toHaveBeenCalled();
    f.controller.abortBeforeClose(ticket);
    expect(f.events).toEqual(['pause', 'freeze', 'abort', 'resume']);
  });

  it('impide dos preparaciones simultáneas y tickets obsoletos', async () => {
    const f = fixture();
    const job = f.controller.prepare();
    await expect(f.controller.prepare()).rejects.toThrow('iniciada');
    f.endPause();
    await job;
    expect(() => f.controller.abortBeforeClose(6)).toThrow('obsoleto');
    expect(f.resumeHeartbeat).not.toHaveBeenCalled();
    f.controller.abortBeforeClose(7);
  });

  it('si falla el preflight reanuda heartbeat y no confirma la preparación', async () => {
    const f = fixture();
    f.freezeAndDrainOtherActivity.mockRejectedValueOnce(new Error('Backup pendiente'));
    const job = f.controller.prepare();
    f.endPause();
    await expect(job).rejects.toThrow('Backup pendiente');
    expect(f.events).toEqual(['pause', 'resume']);
    expect(() => f.controller.assertPrepared(7)).toThrow();
  });

  it('nunca reanuda heartbeat simplemente porque el ticket está preparado', async () => {
    const f = fixture();
    const job = f.controller.prepare();
    f.endPause();
    const ticket = await job;
    f.controller.assertPrepared(ticket);
    expect(f.resumeHeartbeat).not.toHaveBeenCalled();
    expect(() => f.controller.assertPrepared(ticket + 1)).toThrow();
    f.controller.abortBeforeClose(ticket);
  });
});
