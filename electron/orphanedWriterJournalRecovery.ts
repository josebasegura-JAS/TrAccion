/**
 * PR489 — assisted, fail-closed reconciliation of an orphaned durable journal.
 *
 * This module MUST NOT be exposed to renderer IPC or used to automatically
 * reopen Electron main. A previously spawned utilityProcess may still be alive
 * after its parent crashes; the caller must establish its termination and
 * hold an exclusive, independently checked SMB recovery barrier.
 */
import type { DurableWriterJournal, SqliteReconciliationEvidence } from './durableWriterJournal.js';
import { verifyDetachedSqliteCommitAfterExit } from './detachedWriterCommitReceipt.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';

export interface OrphanedWriterRecoveryDependencies {
  journal: DurableWriterJournal;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  /**
   * Must independently demonstrate the PREVIOUS writer process has stopped,
   * including any orphaned child after the Electron main process crashed.
   * Throw if termination cannot be established. Never rely on stale TTL alone.
   */
  assertPreviousWriterTerminated: () => Promise<void>;
  /**
   * Must own the full recovery window: no competing worker/main writer,
   * no independent backups/IO, validated SMB identity and exclusive lock.
   * The lock MUST remain held until callback resolves or rejects.
   * Throw on network uncertainty or if the lock cannot be obtained.
   */
  withExclusiveRecoveryBarrier: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface OrphanedRecoveryResult {
  readonly reconciled: ReadonlyArray<{
    id: string;
    generation: number;
    outcome: SqliteReconciliationEvidence['outcome'];
  }>;
  readonly remaining: ReadonlyArray<{ id: string; generation: number }>;
}

/**
 * Reconciles only journal entries backed by atomic SQLite receipts.
 * Always operates on readonly SQLite handles. Missing receipt table, bad
 * identity, interrupted SMB or uncertain prior process => throw, retain
 * unresolved entries and do NOT reopen the writer.
 *
 * Returned result is REPORT-ONLY. It does not restore the ownership fence.
 */
export async function reconcileOrphanedWriterJournal(
  deps: OrphanedWriterRecoveryDependencies,
): Promise<OrphanedRecoveryResult> {
  if (!deps.databasePath.trim() || !deps.expected.databaseUuid.trim()) {
    throw new Error('Recuperación requiere ruta e identidad SQLite válidas.');
  }
  // Take a snapshot first; journal itself rejects damaged or mismatched data.
  const pending = deps.journal.unsettled();
  if (pending.some(entry => entry.databaseUuid !== deps.expected.databaseUuid)) {
    throw new Error('Journal e identidad SQLite distintos: recuperación suspendida.');
  }
  if (pending.length === 0) {
    return { reconciled: [], remaining: [] };
  }

  // An orphaned utilityProcess cannot be assumed dead just because its
  // Electron parent restarted. This must happen BEFORE reading SQLite.
  await deps.assertPreviousWriterTerminated();

  return deps.withExclusiveRecoveryBarrier(async () => {
    // Recheck after obtaining exclusive ownership, before the first read.
    await deps.assertPreviousWriterTerminated();

    const reconciled: Array<{
      id: string; generation: number; outcome: SqliteReconciliationEvidence['outcome']
    }> = [];
    for (const entry of pending) {
      // Keep journal writes in 'unknown' state before any expensive SQLite
      // verification, including entries that previously had an ACK.
      // Each state transition is durably persisted by the journal.
      const current = deps.journal.unsettled().find(e => e.id === entry.id);
      if (!current || current.generation !== entry.generation) {
        throw new Error('Journal cambió durante recuperación: intervención requerida.');
      }
      if (current.state !== 'unknown') {
        deps.journal.markGenerationUnknown(entry.generation);
      }
      const evidence = verifyDetachedSqliteCommitAfterExit(
        deps.databasePath, deps.expected,
        { operationId: entry.id, generation: entry.generation,
          databaseUuid: entry.databaseUuid }, true,
      );
      // Only an evidence object generated from the actual SQLite receipt can
      // settle the journal. No ACK or caller-provided reference is accepted.
      deps.journal.reconcileVerified(entry.id, entry.generation, evidence);
      reconciled.push({ id: entry.id, generation: entry.generation,
        outcome: evidence.outcome });
    }
    return {
      reconciled,
      remaining: deps.journal.unsettled().map(e => ({
        id: e.id, generation: e.generation,
      })),
    };
  });
}
