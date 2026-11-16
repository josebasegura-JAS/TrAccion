import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseLockManager } from './persistence/databaseLockManager.js';
import { withDetachedSqliteSmbLease } from './detachedWriterSmbLease.js';

const directories: string[] = [];
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'traccion-detached-lease-'));
  directories.push(directory);
  const databasePath = path.join(directory, 'traccion.sqlite');
  const first = createDatabaseLockManager({ getOwnerId: () => 'detached:fixture-A' });
  const second = createDatabaseLockManager({ getOwnerId: () => 'detached:fixture-B' });
  return { databasePath, first, second };
}
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('PR477 · lease SMB obligatorio del escritor detached', () => {
  it('adquiere .lockdir antes de entrar y lo libera al terminar', async () => {
    const { databasePath, first } = fixture();
    const value = await withDetachedSqliteSmbLease(first, databasePath, async () => {
      const owner = await first.readLock(first.getLockPath(databasePath));
      expect(owner?.ownerId).toBe('detached:fixture-A');
      return 42;
    });
    expect(value).toBe(42);
    expect(await first.readLock(first.getLockPath(databasePath))).toBeNull();
  });

  it('otro equipo/proceso no puede entrar mientras el primer escritor mantiene el lock', async () => {
    const { databasePath, first, second } = fixture();
    let release!: () => void;
    let entered!: () => void;
    const inside = new Promise<void>(resolve => { entered = resolve; });
    const hold = new Promise<void>(resolve => { release = resolve; });
    const writing = withDetachedSqliteSmbLease(first, databasePath, async () => {
      entered();
      await hold;
      return 'committed';
    });
    await inside;
    let secondEntered = false;
    // La adquisición directa con un plazo muy corto debe rechazar la
    // exclusión mientras el primer propietario está todavía vivo.
    try {
      await expect(second.acquireLock(databasePath, 60)).rejects.toThrow();
      expect(secondEntered).toBe(false);
    } finally {
      release();
      await writing;
    }
    await withDetachedSqliteSmbLease(second, databasePath, () => {
      secondEntered = true;
    });
    expect(secondEntered).toBe(true);
  });

  it('si la escritura lanza error libera el lock y propaga el error', async () => {
    const { databasePath, first, second } = fixture();
    await expect(withDetachedSqliteSmbLease(first, databasePath, () => {
      throw new Error('write failed');
    })).rejects.toThrow('write failed');
    expect(await first.readLock(first.getLockPath(databasePath))).toBeNull();
    await expect(withDetachedSqliteSmbLease(second, databasePath, () => 'new-owner'))
      .resolves.toBe('new-owner');
  });

  it('si no se puede adquirir el lock no ejecuta ni una línea de SQL', async () => {
    const { databasePath, first, second } = fixture();
    const held = await first.acquireLock(databasePath);
    let ran = false;
    try {
      // Inyectar un gestor con adquisición fallida evita esperas arbitrarias.
      const denied = {
        ...second,
        acquireLock: async () => { throw new Error('SMB owner foreign'); },
      };
      await expect(withDetachedSqliteSmbLease(denied, databasePath, () => {
        ran = true;
      })).rejects.toThrow('SMB owner foreign');
      expect(ran).toBe(false);
    } finally {
      await first.releaseLock(first.getLockPath(databasePath), held);
    }
  });

  it('una identidad del lease modificada durante el callback invalida el resultado', async () => {
    const { databasePath, first } = fixture();
    const manager = {
      ...first,
      readLock: async (lockPath: string) => {
        const owner = await first.readLock(lockPath);
        if (changed && owner) return { ...owner, ownerId: 'foreign-owner' };
        return owner;
      },
    };
    let changed = false;
    await expect(withDetachedSqliteSmbLease(manager, databasePath, () => {
      changed = true;
      return 'must-not-be-confirmed';
    })).rejects.toThrow('perdida');
    expect(await first.readLock(first.getLockPath(databasePath))).toBeNull();
  });
});
