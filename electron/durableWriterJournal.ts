/**
 * PR478: fail-closed, local durable handoff ledger (NOT the generic incident log).
 * This journal records operation IDs, never SQL payloads. It must live on a
 * persistent local volume and be written before the request reaches the worker.
 * A completed transport ACK is not proof of a committed SQLite transaction.
 */
import { closeSync, existsSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type DurableWriterState = 'submitted' | 'acknowledged' | 'unknown' | 'reconciled';
export interface SqliteReconciliationEvidence {
  outcome: 'committed' | 'not-committed';
  /** Identifier of a separately reviewed SQLite snapshot / transaction check. */
  sqliteVerificationReference: string;
}
export interface DurableWriterEntry {
  id: string;
  generation: number;
  databaseUuid: string;
  state: DurableWriterState;
  /** Explicit provenance: only operations using the atomic receipt protocol can be auto-reconciled. */
  receiptBacked?: boolean;
  updatedAt: string;
  evidence?: SqliteReconciliationEvidence;
}
interface Snapshot { version: 1; databaseUuid: string; entries: DurableWriterEntry[]; }
export interface DurableWriterJournal {
  recordSubmitted(id: string, generation: number, receiptBacked?: boolean): void;
  recordAcknowledged(id: string, generation: number): void;
  markGenerationUnknown(generation: number): void;
  reconcileVerified(id: string, generation: number, evidence: SqliteReconciliationEvidence): void;
  unsettled(): DurableWriterEntry[];
  snapshot(): DurableWriterEntry[];
}
const checkGeneration = (generation: number): boolean => Number.isSafeInteger(generation) && generation > 0;
const validState = (s: unknown): s is DurableWriterState =>
  s === 'submitted' || s === 'acknowledged' || s === 'unknown' || s === 'reconciled';

export function createDurableWriterJournal(file: string, databaseUuid: string): DurableWriterJournal {
  if (!file || !databaseUuid.trim()) throw new Error('Journal SQLite requiere ruta e identidad de base.');
  let entries: DurableWriterEntry[] = [];
  if (existsSync(file)) {
    // Damaged/truncated/mismatched logs block use; NEVER silently reset.
    const raw = readFileSync(file, 'utf8');
    const snapshot = JSON.parse(raw) as Snapshot;
    if (snapshot.version !== 1 || snapshot.databaseUuid !== databaseUuid || !Array.isArray(snapshot.entries)) {
      throw new Error('Journal de escrituras incompatibles: prohibida la recuperación automática.');
    }
    const seen = new Set<string>();
    for (const entry of snapshot.entries) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim() ||
          seen.has(entry.id) || !checkGeneration(entry.generation) ||
          entry.databaseUuid !== databaseUuid || !validState(entry.state) ||
          (entry.receiptBacked !== undefined && typeof entry.receiptBacked !== 'boolean') ||
          typeof entry.updatedAt !== 'string' ||
          (entry.state === 'reconciled' && (!entry.evidence ||
            !['committed', 'not-committed'].includes(entry.evidence.outcome) ||
            !entry.evidence.sqliteVerificationReference?.trim()))) {
        throw new Error('Journal de escrituras corrupto o ambiguo; intervención requerida.');
      }
      seen.add(entry.id);
    }
    entries = snapshot.entries;
  }

  function persist(next: DurableWriterEntry[]): void {
    const temp = file + '.' + randomUUID() + '.tmp';
    try {
      const bytes = JSON.stringify({ version: 1, databaseUuid, entries: next } satisfies Snapshot);
      // wx avoids overwriting any other writer's temporary file.
      const fd = openSync(temp, 'wx', 0o600);
      try {
        writeFileSync(fd, bytes, 'utf8');
        fsyncSync(fd);
      } finally { closeSync(fd); }
      renameSync(temp, file);
      // Directory durability is supported on POSIX, but may not be available on Windows.
      if (process.platform !== 'win32') {
        const directoryFd = openSync(dirname(file), 'r');
        try { fsyncSync(directoryFd); } finally { closeSync(directoryFd); }
      }
      entries = next;
    } catch (error) {
      try { unlinkSync(temp); } catch { /* retain original error */ }
      // Once a disk write has an uncertain outcome, this instance is unusable.
      poisoned = true;
      throw error;
    }
  }
  let poisoned = false;
  function assertHealthy(): void {
    if (poisoned) throw new Error('Persistencia del journal incierta; cerrar y comprobar antes de reanudar.');
  }
  function current(id: string, generation: number): DurableWriterEntry {
    const found = entries.find(e => e.id === id && e.generation === generation);
    if (!found) throw new Error('Operación de journal desconocida o de otra generación.');
    return found;
  }
  function replace(entry: DurableWriterEntry): void {
    persist(entries.map(e => e.id === entry.id ? entry : e));
  }
  return {
    recordSubmitted(id, generation, receiptBacked = false) {
      assertHealthy();
      if (!id.trim() || !checkGeneration(generation) || entries.some(e => e.id === id)) {
        throw new Error('Operación duplicada o generación inválida en journal.');
      }
      persist([...entries, { id, generation, databaseUuid, receiptBacked,
        state: 'submitted', updatedAt: new Date().toISOString() }]);
    },
    recordAcknowledged(id, generation) {
      assertHealthy();
      const e = current(id, generation);
      if (e.state !== 'submitted') throw new Error('ACK fuera de orden en journal.');
      replace({ ...e, state: 'acknowledged', updatedAt: new Date().toISOString() });
    },
    markGenerationUnknown(generation) {
      assertHealthy();
      persist(entries.map(e => e.generation === generation && e.state !== 'reconciled'
        ? { ...e, state: 'unknown' as const, updatedAt: new Date().toISOString() } : e));
    },
    reconcileVerified(id, generation, evidence) {
      assertHealthy();
      const e = current(id, generation);
      if (e.state !== 'unknown' || !evidence ||
          !['committed', 'not-committed'].includes(evidence.outcome) ||
          !evidence.sqliteVerificationReference?.trim()) {
        throw new Error('Conciliación requiere resultado de comprobación SQLite identificable.');
      }
      replace({ ...e, state: 'reconciled', updatedAt: new Date().toISOString(),
        evidence: { outcome: evidence.outcome, sqliteVerificationReference: evidence.sqliteVerificationReference } });
    },
    unsettled() { assertHealthy(); return entries.filter(e => e.state !== 'reconciled').map(e => ({ ...e })); },
    snapshot() { assertHealthy(); return entries.map(e => ({ ...e })); },
  };
}
