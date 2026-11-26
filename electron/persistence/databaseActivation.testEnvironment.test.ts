import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readDatabasePreferences, writeDatabasePreferences } from './databasePreferences.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createMigratedTestFixture } from './testFixtures.js';
import { readDatabaseIdentity, inspectAndEnsureDatabaseIdentity } from './databaseIdentity.js';
import { activateSqliteDatabase } from './databaseActivation.js';

let profileDirectory: string;
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return profileDirectory;
      throw new Error('Ruta no simulada: ' + name);
    },
  },
}));

// Migraciones y fsync de SQLite en Windows CI pueden superar los 5 s por
// test, como ocurre en sqliteConnection.test.ts. Es un límite de prueba,
// no un cambio del timeout operativo de la aplicación.
describe('arranque aislado con SQLite test', () => {
  let directory: string;
  let originalArgs: string[];
  let requestedLocks: number;

  beforeEach(() => {
    originalArgs = process.argv;
    process.argv = [...originalArgs.filter((s) => !s.startsWith('--traccion-env')), '--traccion-env=test'];
    directory = mkdtempSync(path.join(tmpdir(), 'traccion-integration-env-'));
    profileDirectory = path.join(directory, 'perfil-test');
    requestedLocks = 0;
  });

  afterEach(() => {
    process.argv = originalArgs;
    rmSync(directory, { recursive: true, force: true });
  });

  function deps() {
    return {
      ownerId: 'test-instance',
      busyTimeoutMs: 1000,
      getLockPath: (dbPath: string) => dbPath + '.lockdir',
      acquireStartupLock: async () => {
        requestedLocks += 1;
        return {
          ownerId: 'test-instance',
          username: 'pruebas',
          hostname: 'test',
          pid: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      },
      startDatabaseLockHeartbeat: () => setInterval(() => undefined, 1_000_000),
      releaseLock: async () => undefined,
    };
  }

  it('crea desde Ajustes una SQLite vacía con entorno test, sin copiar producción', async () => {
    const target = path.join(directory, 'red', 'pruebas');
    const activated = await activateSqliteDatabase(target, false, null, deps());
    try {
      expect(activated.status.environment).toBe('test');
      expect(activated.status.databaseUuid.length).toBeGreaterThan(20);
      expect(existsSync(path.join(target, 'traccion.sqlite'))).toBe(true);
      expect(activated.database.prepare('SELECT COUNT(*) AS n FROM task_records').get()).toEqual({ n: 0 });
      expect(requestedLocks).toBe(1);
    } finally {
      activated.database.close();
    }
  }, 30_000);

  it('rechaza la base real antes de crear lock o escribir en su carpeta', async () => {
    const productionDir = path.join(directory, 'produccion');
    mkdirSync(productionDir);
    const dbPath = path.join(productionDir, 'traccion.sqlite');
    createMigratedTestFixture(dbPath);
    inspectAndEnsureDatabaseIdentity(dbPath, {
      allowLegacyBootstrap: true, expectedEnvironment: 'production',
    });

    await expect(activateSqliteDatabase(productionDir, false, null, deps()))
      .rejects.toThrow('Entorno incompatible');
    expect(requestedLocks).toBe(0);
    const verified = new Database(dbPath, { readonly: true });
    try { expect(readDatabaseIdentity(verified)?.environment).toBe('production'); }
    finally { verified.close(); }
    expect(existsSync(dbPath + '.lockdir')).toBe(false);
  }, 30_000);
  it('vincula otra base test solo mediante selección explícita y conserva el UUID al reabrir', async () => {
    const old = path.join(directory, 'old');
    const next = path.join(directory, 'next');
    mkdirSync(old);
    mkdirSync(next);
    for (const folder of [old, next]) {
      const file = path.join(folder, 'traccion.sqlite');
      createMigratedTestFixture(file);
      inspectAndEnsureDatabaseIdentity(file, { allowLegacyBootstrap: true, expectedEnvironment: 'test' });
    }
    const first = await activateSqliteDatabase(old, false, null, deps(), true);
    first.database.close();
    const original = await readDatabasePreferences();
    expect(original.customDirectoryPath).toBe(old);
    await expect(activateSqliteDatabase(next, false, null, deps())).rejects.toThrow('no coincide');
    expect(await readDatabasePreferences()).toEqual(original);
    const second = await activateSqliteDatabase(next, false, null, deps(), true);
    second.database.close();
    expect(second.status.databaseUuid).not.toBe(first.status.databaseUuid);
    expect(await readDatabasePreferences()).toMatchObject({
      customDirectoryPath: next, expectedDatabaseUuid: second.status.databaseUuid,
    });
    const reopened = await activateSqliteDatabase(next, false, null, deps());
    reopened.database.close();
    expect(reopened.status.databaseUuid).toBe(second.status.databaseUuid);
    // Ni siquiera la selección explícita autoriza aceptar un UUID distinto
    // en la MISMA carpeta vinculada.
    await writeDatabasePreferences({ ...(await readDatabasePreferences()), expectedDatabaseUuid: first.status.databaseUuid });
    await expect(activateSqliteDatabase(next, false, null, deps(), true)).rejects.toThrow('no coincide');
  }, 30_000);

  it('rechaza producción incluso tras confirmar el cambio de base test y conserva preferencias', async () => {
    const target = path.join(directory, 'production');
    mkdirSync(target);
    const file = path.join(target, 'traccion.sqlite');
    createMigratedTestFixture(file);
    inspectAndEnsureDatabaseIdentity(file, { allowLegacyBootstrap: true, expectedEnvironment: 'production' });
    const original = await readDatabasePreferences();
    await expect(activateSqliteDatabase(target, false, null, deps(), true)).rejects.toThrow('Entorno incompatible');
    expect(await readDatabasePreferences()).toEqual(original);
    expect(requestedLocks).toBe(0);
  }, 30_000);

});
