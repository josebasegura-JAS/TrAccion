import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqliteDatabase } from './sqliteConnection.js';
import { createPersistedRecordsRepository } from './persistedRecordsRepository.js';
import { acquireRecordLockInTransaction, heartbeatRecordLockInTransaction, releaseRecordLockInTransaction, MODULE_LOCK_RECORD_ID } from './recordLocks.js';
import type { DatabaseStatus } from '../sqlitePersistence.js';

type Connection = InstanceType<typeof Database>;
let dir: string;
let a: Connection;
let b: Connection;
let status: DatabaseStatus;
const ownerA = { ownerId: 'a', ownerName: 'Usuario A', hostname: 'PC-A' };
const ownerB = { ownerId: 'b', ownerName: 'Usuario B', hostname: 'PC-B' };
const backupA = vi.fn();
const backupB = vi.fn();

function repository(db: Connection, ownerId: string, backup: typeof backupA) {
  return createPersistedRecordsRepository({
    ownerId: () => ownerId,
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    safeDatabaseOperation: async (operation) => operation(),
    isDatabaseWriteBlockedByHeartbeat: () => false,
    assertDatabaseWritesAllowed: () => undefined,
    withDatabaseOperationLock: async (_databasePath, operation) => operation(),
    enqueueLocalBackup: backup,
    getTaskRecordsUpdatedAt: () => null,
  });
}
function row(db: Connection, key: string) {
  return db.prepare('SELECT value_json, updated_at FROM persisted_records WHERE key = ?').get(key) as { value_json: string; updated_at: string } | undefined;
}
function refresh(db: Connection) {
  return db.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'").get();
}
function record(key: string, value: string, expectedUpdatedAt: string | null = null) {
  return { key, value: JSON.stringify({ value }), expectedUpdatedAt };
}
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(path.join(tmpdir(), 'traccion-two-connections-'));
  const file = path.join(dir, 'shared.sqlite');
  a = openSqliteDatabase(file, { busyTimeoutMs: 1000 });
  b = openSqliteDatabase(file, { busyTimeoutMs: 1000 });
  status = { ready: true, engine: 'better-sqlite3', phase: 'active', path: file, schemaVersion: 0, isDefaultPath: false, lockPath: file + '.lockdir' };
});
afterEach(() => {
  vi.useRealTimers();
  a?.close();
  b?.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

describe('dos conexiones nativas sobre el mismo archivo SQLite', () => {
  it('dos usuarios que parten de un registro ausente no pueden duplicar ni sobrescribir el alta', async () => {
    const ra = repository(a, 'a', backupA);
    const rb = repository(b, 'b', backupB);
    const [first, second] = await Promise.all([
      ra.savePersistedRecordIfUnchanged(record('shared', 'A')),
      rb.savePersistedRecordIfUnchanged(record('shared', 'B')),
    ]);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.currentUpdatedAt).toBe(first.currentUpdatedAt);
    expect(row(b, 'shared')?.value_json).toBe(record('shared', 'A').value);
    expect(backupA).toHaveBeenCalledTimes(1);
    expect(backupB).not.toHaveBeenCalled();
  });
  it('un lote con un conflicto remoto no modifica las otras claves ni el token de refresco', async () => {
    const ra = repository(a, 'a', backupA);
    const rb = repository(b, 'b', backupB);
    const seed = await ra.savePersistedRecordsIfUnchanged([record('one', 'original'), record('two', 'original')]);
    expect(seed.ok).toBe(true);
    // Separar marcas temporales para reproducir una versión realmente distinta.
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(seed.currentUpdatedAt!) + 1000);
    const remote = await rb.savePersistedRecordIfUnchanged(record('two', 'remoto', seed.currentUpdatedAt));
    expect(remote.ok).toBe(true);
    const before = refresh(b);
    const result = await ra.savePersistedRecordsIfUnchanged([
      record('one', 'local', seed.currentUpdatedAt), record('two', 'local', seed.currentUpdatedAt), record('three', 'nuevo'),
    ]);
    expect(result).toMatchObject({ ok: false, failedRecordKey: 'two', currentUpdatedAt: remote.currentUpdatedAt });
    expect(row(b, 'one')?.value_json).toBe(record('one', 'original').value);
    expect(row(b, 'two')?.value_json).toBe(record('two', 'remoto').value);
    expect(row(b, 'three')).toBeUndefined();
    expect(refresh(b)).toEqual(before);
    expect(backupA).toHaveBeenCalledTimes(1);
  });

  it('rechaza la versión obsoleta incluso con el reloj fijo en el mismo milisegundo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const ra = repository(a, 'a', backupA);
    const rb = repository(b, 'b', backupB);
    const first = await ra.savePersistedRecordIfUnchanged(record('shared', 'original'));
    expect(first.ok).toBe(true);
    const remote = await rb.savePersistedRecordIfUnchanged(record('shared', 'remoto', first.currentUpdatedAt));
    expect(remote.ok).toBe(true);
    expect(Date.parse(remote.currentUpdatedAt!)).toBeGreaterThan(Date.parse(first.currentUpdatedAt!));
    const before = refresh(b);
    expect(await ra.savePersistedRecordIfUnchanged(record('shared', 'obsoleto', first.currentUpdatedAt))).toMatchObject({
      ok: false, currentUpdatedAt: remote.currentUpdatedAt,
    });
    expect(row(b, 'shared')?.value_json).toBe(record('shared', 'remoto').value);
    expect(refresh(b)).toEqual(before);
    expect(backupA).toHaveBeenCalledTimes(1);
  });

  it('preserva OCC atómico cuando el reloj de otro equipo va hacia atrás', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const ra = repository(a, 'a', backupA);
    const rb = repository(b, 'b', backupB);
    const first = await ra.savePersistedRecordsIfUnchanged([record('one', 'original'), record('two', 'original')]);
    expect(first.ok).toBe(true);
    vi.setSystemTime(new Date('2026-11-25T06:00:00.000Z'));
    const remote = await rb.savePersistedRecordsIfUnchanged([
      record('one', 'remoto', first.currentUpdatedAt), record('two', 'remoto', first.currentUpdatedAt),
    ]);
    expect(remote.ok).toBe(true);
    expect(Date.parse(remote.currentUpdatedAt!)).toBeGreaterThan(Date.parse(first.currentUpdatedAt!));
    expect(await ra.savePersistedRecordsIfUnchanged([
      record('one', 'obsoleto', first.currentUpdatedAt), record('three', 'nuevo'),
    ])).toMatchObject({ ok: false, failedRecordKey: 'one', currentUpdatedAt: remote.currentUpdatedAt });
    expect(row(b, 'one')?.value_json).toBe(record('one', 'remoto').value);
    expect(row(b, 'two')?.value_json).toBe(record('two', 'remoto').value);
    expect(row(b, 'three')).toBeUndefined();
  });

  it('el guardado incondicional y la migración invalidan versiones previas con reloj fijo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const ra = repository(a, 'a', backupA);
    const rb = repository(b, 'b', backupB);
    const seed = await ra.savePersistedRecordIfUnchanged(record('one', 'original'));
    const before = refresh(b);
    await ra.savePersistedRecord(record('one', 'directo'));
    const direct = row(b, 'one')!;
    expect(Date.parse(direct.updated_at)).toBeGreaterThan(Date.parse(seed.currentUpdatedAt!));
    expect(refresh(b)).not.toEqual(before);
    expect(await rb.savePersistedRecordIfUnchanged(record('one', 'obsoleto', seed.currentUpdatedAt))).toMatchObject({ ok: false });
    await ra.migrateLocalStorageSnapshot({ records: [record('one', 'migrado')] });
    expect(Date.parse(row(b, 'one')!.updated_at)).toBeGreaterThan(Date.parse(direct.updated_at));
    expect(await rb.savePersistedRecordIfUnchanged(record('one', 'obsoleto', direct.updated_at))).toMatchObject({ ok: false });
    expect(row(b, 'one')?.value_json).toBe(record('one', 'migrado').value);
  });

  it('dos escrituras de claves distintas por el mismo propietario generan refrescos distintos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-25T07:00:00.000Z'));
    const ra = repository(a, 'a', backupA);
    const first = await ra.savePersistedRecordIfUnchanged(record('one', 'A'));
    const before = refresh(b);
    const second = await ra.savePersistedRecordIfUnchanged(record('two', 'B'));
    expect(first.ok && second.ok).toBe(true);
    expect(Date.parse(second.currentUpdatedAt!)).toBeGreaterThan(Date.parse(first.currentUpdatedAt!));
    expect(refresh(b)).not.toEqual(before);
  });
  it('un error SQL en la segunda escritura revierte incluso la primera y no genera respaldo', async () => {
    const ra = repository(a, 'a', backupA);
    b.exec("CREATE TRIGGER reject_second BEFORE INSERT ON persisted_records WHEN NEW.key = 'second' BEGIN SELECT RAISE(ABORT, 'fallo inyectado'); END");
    const before = refresh(b);
    await expect(ra.savePersistedRecordsIfUnchanged([record('first', 'A'), record('second', 'B')])).rejects.toThrow('fallo inyectado');
    expect(row(b, 'first')).toBeUndefined();
    expect(row(b, 'second')).toBeUndefined();
    expect(refresh(b)).toEqual(before);
    expect(backupA).not.toHaveBeenCalled();
    b.exec('DROP TRIGGER reject_second');
    expect((await ra.savePersistedRecordsIfUnchanged([record('first', 'A'), record('second', 'B')])).ok).toBe(true);
    expect(row(b, 'first')?.value_json).toBe(record('first', 'A').value);
    expect(row(b, 'second')?.value_json).toBe(record('second', 'B').value);
  });
  it('rechaza claves duplicadas antes de iniciar el lote', async () => {
    const ra = repository(a, 'a', backupA);
    expect(await ra.savePersistedRecordsIfUnchanged([record('same', 'A'), record('same', 'B')])).toMatchObject({ ok: false, message: expect.stringContaining('duplicadas') });
    expect(row(b, 'same')).toBeUndefined();
    expect(backupA).not.toHaveBeenCalled();
  });
  it('un usuario que pierde su lease no puede renovar ni borrar el adquirido por otro', () => {
    const target = { module: 'tareas', recordId: 'shared-task' };
    expect(acquireRecordLockInTransaction(a, target, ownerA).ok).toBe(true);
    expect(acquireRecordLockInTransaction(b, target, ownerB).ok).toBe(false);
    a.prepare('UPDATE editing_locks SET expires_at = ? WHERE owner_id = ?').run(new Date(Date.now() - 1000).toISOString(), ownerA.ownerId);
    expect(acquireRecordLockInTransaction(b, target, ownerB).ok).toBe(true);
    expect(heartbeatRecordLockInTransaction(a, target, ownerA)).toMatchObject({ ok: false, lock: { ownerId: 'b' } });
    releaseRecordLockInTransaction(a, target, ownerA);
    expect(heartbeatRecordLockInTransaction(b, target, ownerB)).toMatchObject({ ok: true, lock: { ownerId: 'b' } });
  });
  it('un bloqueo de módulo impide editar registros desde la otra conexión hasta liberarlo', () => {
    const moduleLock = { module: 'comite', recordId: MODULE_LOCK_RECORD_ID };
    const target = { module: 'comite', recordId: 'session' };
    expect(acquireRecordLockInTransaction(a, moduleLock, ownerA).ok).toBe(true);
    expect(acquireRecordLockInTransaction(b, target, ownerB).ok).toBe(false);
    releaseRecordLockInTransaction(a, moduleLock, ownerA);
    expect(acquireRecordLockInTransaction(b, target, ownerB).ok).toBe(true);
  });
});
