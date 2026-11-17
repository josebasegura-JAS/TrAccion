import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseLockManager } from './databaseLockManager.js';

const dirs: string[] = [];
function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), 'traccion-pr503-lock-'));
  dirs.push(dir);
  const dbPath = path.join(dir, 'data.sqlite');
  const manager = createDatabaseLockManager({
    getOwnerId: () => 'pr503-test-' + dir,
  });
  return { dbPath, manager };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('PR503 · lock de operación SQLite ordinario', () => {
  it('mantiene el lock durante todo el callback y lo libera después', async () => {
    const { dbPath, manager } = setup();
    let observed = false;
    const result = await manager.withDatabaseOperationLock(dbPath, async () => {
      const owner = await manager.readLock(manager.getLockPath(dbPath));
      expect(owner?.ownerId).toContain('pr503-test-');
      observed = true;
      return 42;
    });
    expect(result).toBe(42);
    expect(observed).toBe(true);
    expect(await manager.readLock(manager.getLockPath(dbPath))).toBeNull();
  });

  it('libera al fallar el callback y permite adquirir un lock nuevo', async () => {
    const { dbPath, manager } = setup();
    await expect(manager.withDatabaseOperationLock(dbPath, async () => {
      throw new Error('fallo controlado');
    })).rejects.toThrow('fallo controlado');
    await expect(manager.withDatabaseOperationLock(dbPath, async () => 'recovered'))
      .resolves.toBe('recovered');
  });
});
