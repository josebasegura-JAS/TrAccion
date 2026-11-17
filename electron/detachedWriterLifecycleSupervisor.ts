/**
 * PR500 — fail-closed supervisor for a single experimental writer session.
 * Not wired to production. No PID/TTL-based orphan reaping, no auto restart.
 *
 * The caller must first complete the coordinator's freeze/drain/close steps.
 * It must supply an independent SMB lease verifier. An exit confirms only
 * this observed child died; journal reconciliation and DB reactivation are
 * responsibilities of a separate recovery barrier.
 */
import {
  createSupervisedDetachedWriterSession,
  type SupervisedDetachedChild,
} from './supervisedDetachedWriterSession.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteWorkerLockProof } from './sqliteWorkerOwnershipVerification.js';
import type {
  DetachedWriterProcessRecord, DetachedWriterProcessStore,
} from './detachedWriterProcessStore.js';

export interface DetachedWriterSupervisorOptions {
  createChild: () => SupervisedDetachedChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  store: DetachedWriterProcessStore;
  verifyOwnership: (proof: SqliteWorkerLockProof) => Promise<void>;
  /** Required: quarantine the matching generation before any recovery. */
  onUncertain: (generation: number) => void;
  /** Required: notify handoff fence of real EXIT; must not reopen main. */
  onExitConfirmed: (generation: number, code: number) => void;
  timeoutMs?: number;
}

export function createDetachedWriterLifecycleSupervisor(options: DetachedWriterSupervisorOptions) {
  let claimed: DetachedWriterProcessRecord | null = null;
  let child: SupervisedDetachedChild | null = null;
  let exited = false;
  let durableExit = false;
  let stopRequested = false;
  let finishExit!: () => void;
  // A missing EXIT intentionally leaves this promise pending for life.
  const exitPromise = new Promise<void>(resolve => { finishExit = resolve; });
  let recordFailure: unknown = null;
  const session = createSupervisedDetachedWriterSession({
    databasePath: options.databasePath,
    expected: options.expected,
    timeoutMs: options.timeoutMs,
    createChild() {
      const created = options.createChild();
      child = created;
      return created;
    },
    verifyOwnership: options.verifyOwnership,
    onUncertain(generation) {
      // Never trust a transport response to release ownership.
      options.onUncertain(generation);
    },
    onExitConfirmed(generation, code) {
      exited = true;
      try {
        if (!claimed || generation !== claimed.generation) {
          throw new Error('Salida de otra generación del escritor.');
        }
        options.store.confirmExit(claimed, code);
        durableExit = true;
      } catch (error) {
        recordFailure = error;
        try { options.onUncertain(generation); } catch { /* quarantine remains */ }
      }
      try { options.onExitConfirmed(generation, code); }
      catch (error) { recordFailure ??= error; }
      finishExit();
    },
  });

  return {
    async start(generation: number): Promise<void> {
      if (claimed || child) throw new Error('Supervisor: sesión previa no conciliada.');
      if (!Number.isSafeInteger(generation) || generation <= 0) {
        throw new Error('Generación SQLite inválida.');
      }
      if (options.timeoutMs !== undefined &&
          (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)) {
        throw new Error('Timeout del supervisor SQLite inválido.');
      }
      // Durable claim BEFORE fork. Existing marker after a parent crash blocks
      // even if an earlier journal is empty or the SMB lease looks expired.
      claimed = options.store.claim(options.expected.databaseUuid, generation);
      await session.startWriter(generation);
      await session.verifyWorkerSmbOwnership(generation);
      if (exited || recordFailure) {
        throw new Error('Worker terminó durante verificación: cuarentena.');
      }
    },
    requestStop(): void {
      if (!claimed) throw new Error('Supervisor sin writer iniciado.');
      if (exited || stopRequested) return;
      stopRequested = true;
      try { child?.kill(); } catch { /* never infer EXIT from kill */ }
    },
    async waitForConfirmedExit(): Promise<void> {
      if (!claimed) throw new Error('Supervisor sin writer iniciado.');
      await exitPromise;
      if (!exited || !durableExit || recordFailure) {
        throw new Error('Salida del writer no confirmada durablemente: cuarentena.');
      }
    },
    snapshot() {
      return {
        generation: claimed?.generation ?? null,
        started: claimed !== null,
        exitObserved: exited,
        exitDurable: durableExit,
        stopRequested,
        verified: session.snapshot()?.verified === true && !exited && !stopRequested,
      };
    },
  };
}
