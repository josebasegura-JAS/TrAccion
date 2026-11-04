import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeOperationLockRetryDelayMs, createDatabaseLockManager } from './databaseLockManager.js';

describe('integridad de locks durante cambios de red (sin servidor SMB real)', () => {
  let directory: string;
  let dbPath: string;

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-lock-network-'));
    dbPath = path.join(directory, 'shared.sqlite');
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('reintenta con dispersión acotada y primeros intentos rápidos', () => {
    expect(computeOperationLockRetryDelayMs(0, 0)).toBe(50);
    expect(computeOperationLockRetryDelayMs(0, 0.99)).toBeLessThan(90);
    expect(computeOperationLockRetryDelayMs(1, 0)).toBeGreaterThanOrEqual(50);
    expect(computeOperationLockRetryDelayMs(9, 0.99)).toBeLessThanOrEqual(180);
    expect(computeOperationLockRetryDelayMs(4, 0)).not.toBe(computeOperationLockRetryDelayMs(4, 0.9));
  });

  it('no elimina un lock con metadatos transitoriamente incompletos', async () => {
    const owner = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const lockPath = owner.getLockPath(dbPath);
    mkdirSync(lockPath);
    writeFileSync(path.join(lockPath, 'owner.json'), '{"ownerId":', 'utf8');
    await expect(owner.acquireLock(dbPath, 180)).rejects.toThrow();
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(path.join(lockPath, 'owner.json'))).toBe(true);
  });

  it('dos propietarios no adquieren simultáneamente un lock vivo', async () => {
    const first = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const second = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const lock = await first.acquireLock(dbPath, 100);
    try {
      await expect(second.acquireLock(dbPath, 120)).rejects.toThrow();
      expect((await first.readLock(first.getLockPath(dbPath)))?.ownerId).toBe('equipo-a');
    } finally {
      await first.releaseLock(first.getLockPath(dbPath), lock);
    }
    const secondLock = await second.acquireLock(dbPath, 200);
    expect(secondLock.ownerId).toBe('equipo-b');
    await second.releaseLock(second.getLockPath(dbPath), secondLock);
  });

  it('otro usuario no puede liberar el bloqueo mientras pertenece al primero', async () => {
    const first = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const other = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const lock = await first.acquireLock(dbPath, 100);
    await other.releaseLock(other.getLockPath(dbPath), { ...lock, ownerId: 'equipo-b' });
    expect(existsSync(first.getLockPath(dbPath))).toBe(true);
    expect((await first.readLock(first.getLockPath(dbPath)))?.ownerId).toBe('equipo-a');
    await first.releaseLock(first.getLockPath(dbPath), lock);
  });

  it('si el propietario mantiene el lock, las escrituras de otro esperan hasta liberarlo', async () => {
    const first = createDatabaseLockManager({ getOwnerId: () => 'equipo-a' });
    const second = createDatabaseLockManager({ getOwnerId: () => 'equipo-b' });
    const events: string[] = [];
    let finish!: () => void;
    const hold = new Promise<void>((resolve) => { finish = resolve; });
    const writing = first.withDatabaseOperationLock(dbPath, async () => {
      events.push('a-start');
      await hold;
      events.push('a-finish');
    });
    // Esperar de forma determinista a que el propietario A tenga el bloqueo.
    for (let i = 0; i < 40 && !events.includes('a-start'); i += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5));
    }
    expect(events).toContain('a-start');
    const secondWriting = second.withDatabaseOperationLock(dbPath, async () => { events.push('b-start'); }, 1000);
    await new Promise<void>((resolve) => setTimeout(resolve, 75));
    expect(events).not.toContain('b-start');
    finish();
    await writing;
    await secondWriting;
    expect(events).toEqual(['a-start', 'a-finish', 'b-start']);
  });
});
