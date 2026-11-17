import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDurableWriterJournal } from './durableWriterJournal.js';
import { createSqliteEngineOwnershipFence } from './sqliteEngineOwnershipFence.js';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { createSqliteWriterHandoffCoordinator } from './sqliteWriterHandoffCoordinator.js';

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
    });
    const generation = await coordinator.handoff();
    coordinator.registerWriterOperation('op:4', generation);
    coordinator.acknowledgeWriterOperation('op:4', generation);
    coordinator.workerExited(generation);
    expect(() => coordinator.restoreMainAfterReconciliation(generation, true, true)).toThrow();
    expect(() => coordinator.reconcileWriterOperation('op:4', generation)).toThrow('evidencia');
    coordinator.reconcileWriterOperation('op:4', generation, {
      outcome: 'committed', sqliteVerificationReference: 'verified-snapshot:op4',
    });
    expect(createDurableWriterJournal(f.file, f.uuid).unsettled()).toEqual([]);
    coordinator.restoreMainAfterReconciliation(generation, true, true);
    expect(fence.snapshot().owner).toBe('main');
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
    });
    // PR478 does not enable handoff; historical uncertainty must block recovery.
    const generation = await coordinator.handoff();
    coordinator.workerExited(generation);
    expect(() => coordinator.restoreMainAfterReconciliation(generation, true, true)).toThrow('Journal durable');
  });
});
