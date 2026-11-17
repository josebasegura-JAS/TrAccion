import { describe, expect, it } from 'vitest';
import { sqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { runIsolatedSqliteReadUnderHandoffBarrier } from './isolatedSqliteReadAdmission.js';

describe('PR494 · readers detached and SQLite handoff', () => {
  it('reserves BEFORE invoking child-creation callback and remains admitted until EXIT', async () => {
    let releaseExit!: () => void;
    let callbackEntered = false;
    const exited = new Promise<void>((resolve) => { releaseExit = resolve; });
    const running = runIsolatedSqliteReadUnderHandoffBarrier('tasks', async () => {
      callbackEntered = true;
      expect(sqliteIndependentActivityTracker.snapshot().labels)
        .toContain('sqlite:isolated-read:tasks');
      // A transport ACK may have occurred, but child EXIT has not.
      await exited;
      return ['completed-after-exit'];
    });
    expect(callbackEntered).toBe(true);
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    let drained = false;
    const drain = sqliteIndependentActivityTracker.waitForDrain(ticket)
      .then(() => { drained = true; });
    try {
      await Promise.resolve();
      expect(drained).toBe(false);
      expect(sqliteIndependentActivityTracker.snapshot())
        .toMatchObject({active:1, frozen:true});
      releaseExit();
      expect(await running).toEqual(['completed-after-exit']);
      await drain;
      expect(drained).toBe(true);
      expect(sqliteIndependentActivityTracker.snapshot())
        .toMatchObject({active:0, frozen:true});
    } finally {
      releaseExit();
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });

  it('denies spawning every reader family when admission is frozen', async () => {
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      for(const kind of ['tasks','sessions','json','sync-tokens'] as const) {
        let started = false;
        await expect(runIsolatedSqliteReadUnderHandoffBarrier(kind, async () => {
          started = true;
          return 1;
        })).rejects.toThrow('suspendida');
        expect(started).toBe(false);
      }
      expect(sqliteIndependentActivityTracker.snapshot().active).toBe(0);
    } finally {
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });

  it('retains admission after a simulated timeout until child really exits', async () => {
    let exit!: () => void;
    const done = new Promise<void>(resolve => { exit = resolve; });
    const running = runIsolatedSqliteReadUnderHandoffBarrier('sync-tokens', async () => {
      // The runner requests kill on timeout, but does NOT settle until EXIT.
      await done;
      throw new Error('reader failed after confirmed EXIT');
    });
    const ticket = sqliteIndependentActivityTracker.beginFreeze();
    try {
      let drained = false;
      const drain = sqliteIndependentActivityTracker.waitForDrain(ticket)
        .then(() => { drained = true; });
      await Promise.resolve();
      expect(drained).toBe(false);
      exit();
      await expect(running).rejects.toThrow('confirmed EXIT');
      await drain;
      expect(drained).toBe(true);
    } finally {
      exit();
      sqliteIndependentActivityTracker.abortFreeze(ticket);
    }
  });
});
