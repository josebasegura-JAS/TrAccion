import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getVacuumStatus, runScheduledVacuumIfDue, vacuumDatabase } from './vacuumMaintenance.js';
import type { DatabaseStatus, DatabaseLockInfo } from '../sqlitePersistence.js';

describe('mantenimiento VACUUM SQLite', () => {
  let directory: string;
  let db: InstanceType<typeof Database>;
  let databasePath: string;
  let status: DatabaseStatus;
  const lock: DatabaseLockInfo = {
    ownerId: 'test', username: 'test', hostname: 'test', pid: 1,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  };
  function dependencies() {
    return {
      getDatabase: () => db,
      getStatus: () => status,
      acquireLock: vi.fn(async () => lock),
      releaseLock: vi.fn(async () => undefined),
      getLockPath: (file: string) => file + '.lockdir',
      startDatabaseLockHeartbeat: vi.fn(() => setInterval(() => undefined, 1000)),
      isLockContentionError: (error: unknown) => error instanceof Error && error.message === 'LOCKED',
    };
  }
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-vacuum-test-'));
    databasePath = path.join(directory, 'test.sqlite');
    db = new Database(databasePath);
    db.exec('CREATE TABLE app_metadata (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT); CREATE TABLE business_data (id INTEGER PRIMARY KEY, value TEXT)');
    status = { ready: true, phase: 'active', path: databasePath, engine: 'better-sqlite3',
      schemaVersion: 1, isDefaultPath: false, lockPath: databasePath + '.lockdir' };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    db.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('compacta una base real, conserva datos y registra la fecha de éxito', async () => {
    const insert = db.prepare('INSERT INTO business_data VALUES (?, ?)');
    db.transaction(() => {
      for (let id = 1; id <= 100; id++) insert.run(id, 'x'.repeat(4000));
    })();
    db.exec('DELETE FROM business_data WHERE id > 1');
    const deps = dependencies();
    const result = await vacuumDatabase(deps, 'test');
    expect(result.ok).toBe(true);
    expect(result.sizeBeforeBytes).not.toBeNull();
    expect(result.sizeAfterBytes).not.toBeNull();
    expect(result.sizeAfterBytes!).toBeLessThan(result.sizeBeforeBytes!);
    expect(db.prepare('SELECT id, value FROM business_data').all()).toEqual([{ id: 1, value: 'x'.repeat(4000) }]);
    expect(db.pragma('quick_check')).toEqual([{ quick_check: 'ok' }]);
    expect((await getVacuumStatus(deps)).lastVacuumAt).toEqual(expect.any(String));
    expect(deps.releaseLock).toHaveBeenCalledWith(status.lockPath, lock);
  }, 20000);

  it('no compacta ni adquiere locks cuando la base no está activa', async () => {
    status = { ...status, ready: false, phase: 'fallback' };
    const deps = dependencies();
    expect((await vacuumDatabase(deps, 'test')).ok).toBe(false);
    await runScheduledVacuumIfDue(deps);
    expect(deps.acquireLock).not.toHaveBeenCalled();
    expect(await getVacuumStatus(deps)).toEqual({ lastVacuumAt: null, currentSizeBytes: null, heaviestTables: [] });
  });

  it('no ejecuta VACUUM si otro usuario tiene el bloqueo', async () => {
    const deps = dependencies();
    deps.acquireLock.mockRejectedValueOnce(new Error('LOCKED'));
    const exec = vi.spyOn(db, 'exec');
    expect((await vacuumDatabase(deps, 'test')).ok).toBe(false);
    expect(exec).not.toHaveBeenCalled();
    expect(deps.startDatabaseLockHeartbeat).not.toHaveBeenCalled();
    expect(deps.releaseLock).not.toHaveBeenCalled();
  });

  it('libera el lock y detiene el heartbeat si falla la compactación', async () => {
    vi.useFakeTimers();
    const deps = dependencies();
    vi.spyOn(db, 'exec').mockImplementationOnce(() => { throw new Error('fallo VACUUM'); });
    const result = await vacuumDatabase(deps, 'test');
    expect(result.ok).toBe(false);
    expect(result.message).toBe('fallo VACUUM');
    expect(deps.releaseLock).toHaveBeenCalledWith(status.lockPath, lock);
    expect(vi.getTimerCount()).toBe(0);
    expect(db.prepare('SELECT * FROM app_metadata').all()).toEqual([]);
  });

  it('propaga un fallo de adquisición distinto de la contención', async () => {
    const deps = dependencies();
    deps.acquireLock.mockRejectedValueOnce(new Error('E/S'));
    await expect(vacuumDatabase(deps, 'test')).rejects.toThrow('E/S');
    expect(deps.releaseLock).not.toHaveBeenCalled();
  });

  it.each(['recent', 'due', 'invalid', 'missing'] as const)('respeta la planificación semanal: %s', async (kind) => {
    const now = new Date('2026-11-24T10:00:00Z');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    if (kind !== 'missing') {
      const value = kind === 'invalid' ? 'invalid' : new Date(now.getTime() - (kind === 'due' ? 7 : 6) * 86400000).toISOString();
      db.prepare('INSERT INTO app_metadata VALUES (?, ?, ?)').run('last_vacuum_at', value, value);
    }
    const deps = dependencies();
    await runScheduledVacuumIfDue(deps);
    expect(deps.acquireLock).toHaveBeenCalledTimes(kind === 'recent' ? 0 : 1);
    if (kind !== 'recent') expect((await getVacuumStatus(deps)).lastVacuumAt).toBe(now.toISOString());
  }, 20000);
});
