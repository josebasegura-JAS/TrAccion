import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { createDurableWriterJournal } from './durableWriterJournal.js';
import { saveWithDetachedCommitReceipt } from './detachedWriterCommitReceipt.js';
import { reconcileOrphanedWriterJournal } from './orphanedWriterJournalRecovery.js';

const folders: string[] = [];
const expected = { databaseUuid: 'db-pr489', applicationId: 'TrAccion',
  environment: 'test', schemaVersion: 1 };
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'traccion-orphan489-'));
  folders.push(folder);
  const databasePath = join(folder, 'shared.sqlite');
  const journalPath = join(folder, 'writer.json');
  const db = new Database(databasePath);
  db.exec(`CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updated_at TEXT NOT NULL);
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES (1, '2026-11-17');
    CREATE TABLE work (id TEXT PRIMARY KEY);`);
  for (const [key, value] of [
    ['database_uuid', expected.databaseUuid], ['application_id', expected.applicationId],
    ['environment', expected.environment], ['database_created_at', '2026-11-17'],
  ]) db.prepare('INSERT INTO app_metadata VALUES (?,?,?)').run(key, value, '2026-11-17');
  const journal = createDurableWriterJournal(journalPath, expected.databaseUuid);
  const terminated = vi.fn(async () => undefined);
  // Keep the Vitest spy non-generic; adapt it to the generic recovery contract.
  const barrier = vi.fn(async (work: () => Promise<unknown>): Promise<unknown> => work());
  const recovery = (override?: Partial<Parameters<typeof reconcileOrphanedWriterJournal>[0]>) =>
    reconcileOrphanedWriterJournal({
      journal: createDurableWriterJournal(journalPath, expected.databaseUuid),
      databasePath, expected,
      assertPreviousWriterTerminated: terminated,
      withExclusiveRecoveryBarrier: <T>(work: () => Promise<T>): Promise<T> =>
        barrier(work) as Promise<T>,
      ...override,
    });
  return { db, journal, journalPath, databasePath, terminated, barrier, recovery };
}
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, {recursive:true, force:true}); });

describe('PR489 · recuperación segura de journal huérfano', () => {
  it('reconciles committed and absent operations after restart using real SQLite receipts', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-committed', 13, true);
      f.journal.recordAcknowledged('op-committed', 13);
      f.journal.recordSubmitted('op-absent', 13, true);
      saveWithDetachedCommitReceipt(f.db,
        {operationId:'op-committed',generation:13,databaseUuid:expected.databaseUuid},
        () => { f.db.prepare('INSERT INTO work VALUES (?)').run('saved'); return {ok:true}; });
      f.db.close(); // Simulates stopped worker before independent readonly verification.
      const result = await f.recovery();
      expect(result.reconciled).toEqual([
        {id:'op-committed',generation:13,outcome:'committed'},
        {id:'op-absent',generation:13,outcome:'not-committed'},
      ]);
      expect(result.remaining).toEqual([]);
      expect(f.terminated).toHaveBeenCalledTimes(2);
      expect(f.barrier).toHaveBeenCalledTimes(1);
      const persisted = createDurableWriterJournal(f.journalPath, expected.databaseUuid);
      expect(persisted.unsettled()).toEqual([]);
      expect(persisted.snapshot().map(e => e.evidence?.outcome))
        .toEqual(['committed', 'not-committed']);
      await expect(f.recovery()).resolves.toEqual({reconciled:[],remaining:[]});
    } finally { try { f.db.close(); } catch { /* Ya cerrado explícitamente en la prueba. */ } }
  });

  it('keeps pending journal when previous worker may still be running', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-running', 3, true);
      f.terminated.mockRejectedValue(new Error('worker vivo'));
      await expect(f.recovery()).rejects.toThrow('worker vivo');
      expect(f.barrier).not.toHaveBeenCalled();
      expect(createDurableWriterJournal(f.journalPath, expected.databaseUuid).unsettled())
        .toHaveLength(1);
    } finally { f.db.close(); }
  });

  it('does not read or reconcile without an exclusive SMB recovery barrier', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-lock', 3, true);
      f.barrier.mockRejectedValue(new Error('SMB inaccesible'));
      await expect(f.recovery()).rejects.toThrow('SMB inaccesible');
      expect(createDurableWriterJournal(f.journalPath, expected.databaseUuid).unsettled()[0]?.state)
        .toBe('submitted');
    } finally { f.db.close(); }
  });

  it('missing commit table is uncertain, never interpreted as not-committed', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-unknown', 5, true);
      f.db.close();
      await expect(f.recovery()).rejects.toThrow('commit incierto');
      const pending = createDurableWriterJournal(f.journalPath, expected.databaseUuid).unsettled();
      expect(pending).toMatchObject([{id:'op-unknown',state:'unknown'}]);
    } finally { try { f.db.close(); } catch { /* Ya cerrado explícitamente en la prueba. */ } }
  });

  it('rejects mismatched or damaged SQLite identity and keeps journal quarantined', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-wrong-identity', 2, true);
      f.db.prepare("UPDATE app_metadata SET value = 'another-db' WHERE key = 'database_uuid'").run();
      f.db.close();
      await expect(f.recovery()).rejects.toThrow('identidad');
      expect(createDurableWriterJournal(f.journalPath, expected.databaseUuid).unsettled())
        .toHaveLength(1);
    } finally { try { f.db.close(); } catch { /* Ya cerrado explícitamente en la prueba. */ } }
  });

  it('refuses legacy journal operations without recorded receipt provenance', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('legacy-no-receipt', 4);
      await expect(f.recovery()).rejects.toThrow('sin protocolo de recibo');
      expect(f.terminated).not.toHaveBeenCalled();
      expect(f.barrier).not.toHaveBeenCalled();
      expect(createDurableWriterJournal(f.journalPath, expected.databaseUuid)
        .unsettled()).toMatchObject([{id:'legacy-no-receipt',receiptBacked:false}]);
    } finally { f.db.close(); }
  });

  it('must recheck worker stop INSIDE exclusive barrier; a race blocks recovery', async () => {
    const f = fixture();
    try {
      f.journal.recordSubmitted('op-race', 1, true);
      f.terminated.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('worker sigue vivo'));
      await expect(f.recovery()).rejects.toThrow('worker sigue vivo');
      expect(f.terminated).toHaveBeenCalledTimes(2);
      expect(createDurableWriterJournal(f.journalPath, expected.databaseUuid).unsettled())
        .toHaveLength(1);
    } finally { f.db.close(); }
  });
});
