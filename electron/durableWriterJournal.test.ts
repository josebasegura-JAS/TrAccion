import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { DatabaseConstructor } from 'better-sqlite3';
import { saveWithDetachedCommitReceipt } from './detachedWriterCommitReceipt.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDurableWriterJournal } from './durableWriterJournal.js';
import { createSqliteEngineOwnershipFence } from './sqliteEngineOwnershipFence.js';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { createSqliteWriterHandoffCoordinator } from './sqliteWriterHandoffCoordinator.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
const dirs: string[] = [];
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'traccion-pr478-'));
  dirs.push(dir);
  const file = join(dir, 'worker-journal.json');
  const uuid = 'database-uuid-A';
  return { file, uuid, journal: createDurableWriterJournal(file, uuid) };
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

describe('PR478 · journal durable de escrituras detached', () => {
  it('persiste submitted antes de enviar y sobrevive al reinicio con estado incierto', () => {
    const f = fixture();
    f.journal.recordSubmitted('op:1', 1);
    const restored = createDurableWriterJournal(f.file, f.uuid);
    expect(restored.unsettled()).toMatchObject([{ id: 'op:1', state: 'submitted' }]);
    restored.markGenerationUnknown(1);
    expect(createDurableWriterJournal(f.file, f.uuid).unsettled()[0]?.state).toBe('unknown');
  });
  it('no acepta IDs reutilizados, ACK inexistente ni evidencia vacía', () => {
    const f = fixture();
    f.journal.recordSubmitted('op:1', 1);
    expect(() => f.journal.recordSubmitted('op:1', 2)).toThrow();
    expect(() => f.journal.recordAcknowledged('missing', 1)).toThrow();
    f.journal.recordAcknowledged('op:1', 1);
    f.journal.markGenerationUnknown(1);
    expect(() => f.journal.reconcileVerified('op:1', 1, {
      outcome: 'committed', sqliteVerificationReference: '',
    })).toThrow();
    expect(f.journal.unsettled()).toHaveLength(1);
  });
  it('solo retira incertidumbre con una conciliación identificada y duradera', () => {
    const f = fixture();
    f.journal.recordSubmitted('op:2', 2);
    f.journal.markGenerationUnknown(2);
    f.journal.reconcileVerified('op:2', 2, {
      outcome: 'not-committed', sqliteVerificationReference: 'sqlite-check:record-42',
    });
    const restored = createDurableWriterJournal(f.file, f.uuid);
    expect(restored.unsettled()).toEqual([]);
    expect(restored.snapshot()[0]?.evidence?.outcome).toBe('not-committed');
    expect(() => restored.recordSubmitted('op:2', 3)).toThrow();
  });
  it('corrupción e identidad SQLite distinta bloquean la restauración', () => {
    const f = fixture();
    f.journal.recordSubmitted('op:3', 1);
    expect(() => createDurableWriterJournal(f.file, 'different-db')).toThrow();
    writeFileSync(f.file, '{ truncated');
    expect(() => createDurableWriterJournal(f.file, f.uuid)).toThrow();
  });
  it('no concilia automáticamente resultados tras exit del worker', async () => {
    const f = fixture();
    const fence = createSqliteEngineOwnershipFence();
    const coordinator = createSqliteWriterHandoffCoordinator(fence, {
      durableJournal: f.journal,
      independentActivity: createSqliteIndependentActivityTracker(),
      inspectQueue: () => ({ queuedOperations: 0, runningOperation: null, timedOut: false }),
      assertNoIndependentSqliteActivity: async () => {},
      closeMainHandle: async () => {},
      startWriter: async (generation) => ({ generation }),
      verifyWorkerSmbOwnership: async () => {},
    });
    const generation = await coordinator.handoff();
    coordinator.registerWriterOperation('op:4', generation);
    coordinator.acknowledgeWriterOperation('op:4', generation);
    coordinator.workerExited(generation);
    expect(() => coordinator.restoreMainAfterReconciliation(generation, true, true)).toThrow();
    expect(() => coordinator.reconcileWriterOperation('op:4', generation)).toThrow('evidencia');
    expect(() => coordinator.reconcileWriterOperation('op:4', generation, {
      outcome: 'committed', sqliteVerificationReference: 'verified-snapshot:op4',
    })).toThrow('conciliación directa prohibida');
    expect(createDurableWriterJournal(f.file, f.uuid).unsettled()).toHaveLength(1);
    expect(() => coordinator.restoreMainAfterReconciliation(generation, true, true)).toThrow();
    expect(fence.snapshot().owner).toBe('quarantine');
  });
  it('PR483: verifica commits contra SQLite tras EXIT antes de conciliar el journal', async () => {
    const f = fixture();
    const databasePath = join(f.file + '-db.sqlite');
    const expected = {
      databaseUuid: f.uuid, applicationId: 'TrAccion',
      environment: 'test', schemaVersion: 1,
    };
    const db = new BetterSqlite3(databasePath);
    try {
      db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
        CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT);
        INSERT INTO schema_migrations VALUES (1, '2026-11-17');`);
      for (const [key, value] of [
        ['database_uuid', expected.databaseUuid],
        ['application_id', expected.applicationId],
        ['environment', expected.environment],
        ['database_created_at', '2026-11-17'],
      ]) {
        db.prepare('INSERT INTO app_metadata VALUES (?, ?, ?)').run(key, value, '2026-11-17');
      }
      saveWithDetachedCommitReceipt(db,
        { operationId: 'committed', generation: 1, databaseUuid: f.uuid },
        () => ({ ok: true }));
    } finally { db.close(); }

    const fence = createSqliteEngineOwnershipFence();
    const coordinator = createSqliteWriterHandoffCoordinator(fence, {
      durableJournal: f.journal,
      independentActivity: createSqliteIndependentActivityTracker(),
      inspectQueue: () => ({ queuedOperations: 0, runningOperation: null, timedOut: false }),
      assertNoIndependentSqliteActivity: async () => {},
      closeMainHandle: async () => {},
      startWriter: async (generation) => ({ generation }),
      verifyWorkerSmbOwnership: async () => {},
    });
    const gen = await coordinator.handoff();
    coordinator.registerWriterOperation('committed', gen, true);
    coordinator.registerWriterOperation('absent', gen, true);
    coordinator.registerWriterOperation('legacy-no-receipt', gen);
    expect(() => coordinator.reconcileReceiptedWriterOperation(
      'committed', gen, databasePath, expected)).toThrow('EXIT');
    coordinator.workerExited(gen);
    expect(() => coordinator.reconcileReceiptedWriterOperation(
      'committed', gen, databasePath + '-missing', expected)).toThrow();
    expect(f.journal.unsettled()).toHaveLength(3);
    expect(() => coordinator.reconcileReceiptedWriterOperation(
      'legacy-no-receipt', gen, databasePath, expected)).toThrow('sin recibo');
    const commitEvidence = coordinator.reconcileReceiptedWriterOperation(
      'committed', gen, databasePath, expected);
    expect(commitEvidence.outcome).toBe('committed');
    const absentEvidence = coordinator.reconcileReceiptedWriterOperation(
      'absent', gen, databasePath, expected);
    expect(absentEvidence.outcome).toBe('not-committed');
    expect(f.journal.unsettled()).toMatchObject([{ id: 'legacy-no-receipt', receiptBacked: false }]);
    expect(() => coordinator.restoreMainAfterReconciliation(gen, true, true)).toThrow();
    expect(fence.snapshot().owner).toBe('quarantine');
  });

  it('bloquea un handoff si existen operaciones pendientes de otra ejecución', async () => {
    const f = fixture();
    f.journal.recordSubmitted('op:orphan', 9);
    const fence = createSqliteEngineOwnershipFence();
    const coordinator = createSqliteWriterHandoffCoordinator(fence, {
      durableJournal: createDurableWriterJournal(f.file, f.uuid),
      independentActivity: createSqliteIndependentActivityTracker(),
      inspectQueue: () => ({ queuedOperations: 0, runningOperation: null, timedOut: false }),
      assertNoIndependentSqliteActivity: async () => {},
      closeMainHandle: async () => {},
      startWriter: async (generation) => ({ generation }),
      verifyWorkerSmbOwnership: async () => {},
    });
    // Previous-process uncertainty forbids even starting a new handoff.
    await expect(coordinator.handoff()).rejects.toThrow('Journal durable');
    expect(fence.snapshot().owner).toBe('main');
  });
});
