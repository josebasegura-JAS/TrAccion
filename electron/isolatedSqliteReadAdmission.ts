/**
 * PR494 — Admission barrier for a dedicated SQLite read utilityProcess.
 * Reserve BEFORE fork, retain until the runner observes actual child EXIT.
 * No timeout, IPC response or kill request releases this reservation.
 */
import { sqliteEngineOwnershipFence } from './sqliteEngineOwnershipFence.js';
import { sqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';

export type IsolatedSqliteReadKind = 'tasks' | 'sessions' | 'json' | 'sync-tokens';

export function runIsolatedSqliteReadUnderHandoffBarrier<T>(
  kind: IsolatedSqliteReadKind,
  read: () => Promise<T>,
): Promise<T> {
  sqliteEngineOwnershipFence.assertMayEnterMain();
  return sqliteIndependentActivityTracker.run(`sqlite:isolated-read:${kind}`, read);
}
