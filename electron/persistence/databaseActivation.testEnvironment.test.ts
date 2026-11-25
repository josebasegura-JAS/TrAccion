import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
    const { mkdirSync } = await import('node:fs');
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
});
