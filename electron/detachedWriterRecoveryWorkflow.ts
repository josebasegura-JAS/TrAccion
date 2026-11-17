/**
 * PR501 — orchestrated recovery of an experimental detached SQLite writer.
 *
 * This is an administrative/report-only path, never renderer IPC.
 * It does not make a PID probe, a stale SMB TTL or a marker alone proof
 * of exit. The owner supplies independent termination evidence and a
 * real, exclusive SMB recovery window encompassing every verification.
 *
 * Even SUCCESS does NOT reopen main, delete the tombstone or launch a new
 * writer. That is an independent production cutover decision.
 */
import type { DurableWriterJournal } from './durableWriterJournal.js';
import type { DetachedWriterProcessStore } from './detachedWriterProcessStore.js';
import { reconcileOrphanedWriterJournal } from './orphanedWriterJournalRecovery.js';
import { verifySqliteIntegrityReadOnly } from './persistence/sqliteIntegrityVerification.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';

export interface DetachedWriterRecoveryOptions {
  readonly store: DetachedWriterProcessStore;
  readonly journal: DurableWriterJournal;
  readonly databasePath: string;
  readonly expected: ExpectedSqliteIdentity;
  /** Must prove no previous writer OR orphan remains alive. */
  readonly assertPreviousWriterTerminated: () => Promise<void>;
  /** Must hold a real exclusive SMB lease for the FULL callback, and fail on disconnect. */
  readonly withExclusiveRecoveryBarrier: <T>(work: () => Promise<T>) => Promise<T>;
}

export async function reconcileDetachedWriterAfterCrash(
  deps: DetachedWriterRecoveryOptions,
): Promise<{
  generation: number;
  receiptsReconciled: number;
  tombstoneRetained: true;
}> {
  if (!deps.databasePath.trim() || !deps.expected.databaseUuid.trim() ||
      !deps.expected.applicationId.trim() || !deps.expected.environment.trim() ||
      !Number.isSafeInteger(deps.expected.schemaVersion) || deps.expected.schemaVersion <= 0) {
    throw new Error('Recuperación SQLite: ruta, identidad o esquema inválidos.');
  }
  const marker = deps.store.inspect();
  if (!marker || marker.databaseUuid !== deps.expected.databaseUuid) {
    throw new Error('Recuperación sin marcador duradero válido o con identidad diferente.');
  }
  if (marker.state !== 'exit-confirmed') {
    // A marker in "launching" could belong to a live orphan after main crashed.
    // A reconciled marker must not be used to restart this protocol automatically.
    throw new Error('Salida durable no confirmada o sesión ya conciliada; no reactivar SQLite.');
  }
  const result = await reconcileOrphanedWriterJournal({
    journal: deps.journal,
    databasePath: deps.databasePath,
    expected: deps.expected,
    assertPreviousWriterTerminated: deps.assertPreviousWriterTerminated,
    withExclusiveRecoveryBarrier: deps.withExclusiveRecoveryBarrier,
    alwaysAcquireRecoveryBarrier: true,
    verifyInsideBarrier: async () => {
      // Re-check marker after acquiring exclusivity in case of concurrent
      // administrative recovery. Do not trust its old in-memory snapshot.
      const latest = deps.store.inspect();
      if (!latest || latest.token !== marker.token ||
          latest.generation !== marker.generation ||
          latest.databaseUuid !== marker.databaseUuid ||
          latest.state !== 'exit-confirmed' ||
          latest.exitCode !== marker.exitCode) {
        throw new Error('Marcador de writer cambiado durante recuperación.');
      }
      // Verify identity, schema and quick_check EVEN WHEN journal is empty.
      // No write handle is opened for this verification.
      verifySqliteIntegrityReadOnly(deps.databasePath, deps.expected);
      if (deps.journal.unsettled().some(e => e.generation !== marker.generation)) {
        throw new Error('Journal contiene generaciones ajenas a la sesión del writer.');
      }
    },
    finalizeInsideBarrier: async () => {
      // The journal itself persists each receipt reconciliation before this
      // transition. Remain blocked against a new process even after success.
      deps.store.markReconciled(marker);
    },
  });
  return {
    generation: marker.generation,
    receiptsReconciled: result.reconciled.length,
    tombstoneRetained: true,
  };
}

/**
 * Explicit administrator-controlled rearm AFTER a successful reconciliation.
 *
 * No automatic startup/production path invokes this function. The caller must
 * independently prove the previous child is terminated and supply the same
 * exclusive SMB recovery barrier used for receipt reconciliation. Do not
 * treat a stale PID, lease TTL or an IPC ACK as termination evidence.
 */
export async function rearmReconciledDetachedWriter(
  deps: DetachedWriterRecoveryOptions,
): Promise<{ archivedMarkerPath: string; nextGeneration: number }> {
  const marker = deps.store.inspect();
  if (!marker || marker.state !== 'reconciled' ||
      marker.databaseUuid !== deps.expected.databaseUuid) {
    throw new Error('Rearme SQLite requiere marcador conciliado e identidad coincidente.');
  }
  if (!Number.isSafeInteger(marker.generation + 1)) {
    throw new Error('Rearme SQLite: generación agotada.');
  }
  if (deps.journal.unsettled().length !== 0) {
    throw new Error('Rearme SQLite denegado: journal con operaciones pendientes.');
  }
  await deps.assertPreviousWriterTerminated();
  return deps.withExclusiveRecoveryBarrier(async () => {
    await deps.assertPreviousWriterTerminated();
    const current = deps.store.inspect();
    if (!current || current.state !== 'reconciled' ||
        current.token !== marker.token ||
        current.generation !== marker.generation ||
        current.exitCode !== marker.exitCode ||
        current.databaseUuid !== marker.databaseUuid) {
      throw new Error('Marcador SQLite modificado durante el rearme.');
    }
    if (deps.journal.unsettled().length !== 0) {
      throw new Error('Journal SQLite modificado durante el rearme.');
    }
    verifySqliteIntegrityReadOnly(deps.databasePath, deps.expected);
    // The proof of process termination and database identity is fresh
    // immediately before archiving under the same exclusive SMB barrier.
    await deps.assertPreviousWriterTerminated();
    const archivedMarkerPath = deps.store.archiveReconciled(marker);
    return { archivedMarkerPath, nextGeneration: marker.generation + 1 };
  });
}
