import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqliteDatabase } from './persistence/sqliteConnection.js';

const testContext = vi.hoisted(() => ({ userDataPath: '', failStatPath: '', statFailures: 0 }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, stat: async (...args: Parameters<typeof actual.stat>) => {
    if (args[0] === testContext.failStatPath && testContext.statFailures > 0) {
      testContext.statFailures -= 1;
      throw Object.assign(new Error('Fallo de red inyectado'), { code: 'UNKNOWN', errno: -4094, syscall: 'stat' });
    }
    return actual.stat(...args);
  } };
});

vi.mock('electron', () => ({
  app: {
    getPath: () => testContext.userDataPath,
  },
}));

vi.mock('./persistence/localBackupService.js', () => ({
  createLocalBackupService: () => ({
    enqueueLocalBackup: vi.fn(),
    createShutdownLocalBackup: vi.fn(async () => ({
      prepareMs: 0,
      jsonMs: 0,
      localSqliteMs: 0,
      sharedSqliteMs: 0,
      dailySqliteMs: 0,
    })),
    createManualLocalBackup: vi.fn(async () => undefined),
    listLocalBackups: vi.fn(async () => []),
    restoreLocalBackup: vi.fn(async () => ({
      ok: false,
      status: null,
      message: 'not-used-in-characterization-test',
    })),
  }),
}));

interface TestLayout {
  root: string;
  userData: string;
  sharedDirectory: string;
  databasePath: string;
}

function createTestLayout(): TestLayout {
  const root = mkdtempSync(path.join(tmpdir(), 'traccion-sqlite-persistence-'));
  const userData = path.join(root, 'user-data');
  const sharedDirectory = path.join(root, 'shared');
  const databasePath = path.join(sharedDirectory, 'traccion.sqlite');
  mkdirSync(userData, { recursive: true });
  mkdirSync(sharedDirectory, { recursive: true });
  return { root, userData, sharedDirectory, databasePath };
}

function writePreferences(userData: string, customDirectoryPath: string | null): void {
  writeFileSync(
    path.join(userData, 'sqlite-preferences.json'),
    JSON.stringify(
      {
        customDirectoryPath,
        secondaryBackupDirectoryPath: null,
        dailyLocalBackupEnabled: true,
        dailyLocalBackupRetentionDays: 7,
        dailyLocalBackupDirectoryPath: null,
        updatesDirectoryPath: null,
        expectedDatabaseUuid: null,
      },
      null,
      2,
    ),
    'utf8',
  );
}

function createSharedDatabase(databasePath: string): void {
  const db = openSqliteDatabase(databasePath, { busyTimeoutMs: 5_000 });
  db.close();
}

async function importPersistence() {
  return import('./sqlitePersistence.js');
}

describe('sqlitePersistence — caracterización de fachada', () => {
  let layout: TestLayout;

  beforeEach(() => {
    layout = createTestLayout();
    testContext.userDataPath = layout.userData;
    testContext.failStatPath = '';
    testContext.statFailures = 0;
    vi.resetModules();
  });

  afterEach(async () => {
    testContext.statFailures = 0;
    vi.restoreAllMocks();
    const persistence = await importPersistence();
    await persistence.closeSqlitePersistence();
    rmSync(layout.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }, 20_000);

  it('mantiene la edición bloqueada si no existe una ruta SQLite compartida configurada', async () => {
    writePreferences(layout.userData, null);
    const persistence = await importPersistence();

    const status = await persistence.initializeSqlitePersistence();

    expect(status.ready).toBe(false);
    expect(status.phase).toBe('fallback');
    expect(status.isDefaultPath).toBe(true);
    expect(status.message).toContain('No hay una base de datos compartida configurada');
  });

  it('PR524: un .lockdir vacío no deja la pantalla inicial bloqueada, se recupera y abre la base', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    mkdirSync(`${layout.databasePath}.lockdir`);
    const persistence = await importPersistence();

    const status = await persistence.initializeSqlitePersistence();
    expect(status.ready).toBe(true);
    expect(status.phase).toBe('active');
    expect(status.isDefaultPath).toBe(false);
    await persistence.closeSqlitePersistence();
  }, 25_000);

  it('PR524: una base ausente al arrancar se vuelve a activar desde el health-check', async () => {
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    const first = await persistence.initializeSqlitePersistence();
    expect(first.ready).toBe(false);
    expect(first.isDefaultPath).toBe(false);

    createSharedDatabase(layout.databasePath);
    const result = await persistence.checkSqliteHealth();
    expect(result.ok).toBe(true);
    expect(persistence.getSqliteStatus().ready).toBe(true);
    expect(persistence.getSqliteStatus().path).toBe(layout.databasePath);
    await persistence.closeSqlitePersistence();
  }, 20_000);

  it('activa una base compartida existente y conserva su identidad en el estado', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();

    const status = await persistence.initializeSqlitePersistence();

    expect(status.ready).toBe(true);
    expect(status.phase).toBe('active');
    expect(status.isDefaultPath).toBe(false);
    expect(status.path).toBe(layout.databasePath);
    expect(status.databaseUuid).toEqual(expect.any(String));

    await persistence.closeSqlitePersistence();
  });

  it('rechaza un guardado persisted_records con token OCC obsoleto y acepta el token vigente', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    await persistence.initializeSqlitePersistence();

    const first = await persistence.savePersistedRecordIfUnchanged({
      key: 'characterization.occ',
      value: JSON.stringify({ version: 1 }),
      expectedUpdatedAt: null,
    });
    expect(first.ok).toBe(true);
    expect(first.currentUpdatedAt).toEqual(expect.any(String));

    const stale = await persistence.savePersistedRecordIfUnchanged({
      key: 'characterization.occ',
      value: JSON.stringify({ version: 2 }),
      expectedUpdatedAt: null,
    });
    expect(stale.ok).toBe(false);
    expect(stale.currentUpdatedAt).toBe(first.currentUpdatedAt);
    expect(stale.message).toContain('han cambiado mientras guardabas');

    const current = await persistence.savePersistedRecordIfUnchanged({
      key: 'characterization.occ',
      value: JSON.stringify({ version: 2 }),
      expectedUpdatedAt: first.currentUpdatedAt,
    });
    expect(current.ok).toBe(true);

    const snapshot = await persistence.getPersistedRecordSnapshot('characterization.occ');
    expect(snapshot.record?.value).toBe(JSON.stringify({ version: 2 }));

    await persistence.closeSqlitePersistence();
  }, 25_000);

  it('caracteriza el singleton de Configuración: alta, lectura y rechazo por OCC', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    await persistence.initializeSqlitePersistence();

    const first = await persistence.saveConfiguracionIfUnchanged({
      value: JSON.stringify({ fuente: 'characterization', version: 1 }),
      expectedUpdatedAt: null,
    });
    expect(first.ok).toBe(true);
    expect(first.currentUpdatedAt).toEqual(expect.any(String));

    const loaded = await persistence.loadConfiguracionSnapshot();
    expect(loaded.value).toBe(JSON.stringify({ fuente: 'characterization', version: 1 }));
    expect(loaded.updatedAt).toBe(first.currentUpdatedAt);

    const stale = await persistence.saveConfiguracionIfUnchanged({
      value: JSON.stringify({ fuente: 'characterization', version: 2 }),
      expectedUpdatedAt: null,
    });
    expect(stale.ok).toBe(false);
    expect(stale.currentUpdatedAt).toBe(first.currentUpdatedAt);
    expect(stale.message).toContain('modificada por otro usuario');

    await persistence.closeSqlitePersistence();
  });

  it('al restablecer la ruta compartida vuelve a modo consulta y elimina la ruta personalizada', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    await persistence.initializeSqlitePersistence();

    const status = await persistence.resetSqliteDirectory();

    expect(status.ready).toBe(false);
    expect(status.phase).toBe('fallback');
    expect(status.isDefaultPath).toBe(true);
    expect(status.message).toContain('Se ha quitado la ruta de base de datos compartida');

    const preferences = JSON.parse(
      await (await import('node:fs/promises')).readFile(
        path.join(layout.userData, 'sqlite-preferences.json'),
        'utf8',
      ),
    ) as { customDirectoryPath?: string | null };
    expect(preferences.customDirectoryPath).toBeNull();
  });
  it('recupera una conexión tras un error SQLITE_IOERR sin reenviar la escritura fallida', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    const initial = await persistence.initializeSqlitePersistence();
    expect(initial.ready).toBe(true);
    const first = await persistence.savePersistedRecordIfUnchanged({ key: 'recovery.test', value: '{"version":1}', expectedUpdatedAt: null });
    expect(first.ok).toBe(true);
    const originalPrepare = Database.prototype.prepare;
    let injected = 0;
    const prepare = vi.spyOn(Database.prototype, 'prepare').mockImplementation(function (this: Database.Database, sql: string) {
      if (sql.includes('UPDATE persisted_records') && injected === 0) {
        injected++;
        throw Object.assign(new Error('error de E/S inyectado'), { code: 'SQLITE_IOERR' });
      }
      return originalPrepare.call(this, sql);
    });
    try {
      await expect(persistence.savePersistedRecordIfUnchanged({ key: 'recovery.test', value: '{"version":2}', expectedUpdatedAt: first.currentUpdatedAt })).rejects.toThrow('error de E/S');
      expect(injected).toBe(1);
      expect(persistence.getSqliteStatus()).toMatchObject({ ready: false, phase: 'fallback' });
      await expect(persistence.savePersistedRecordIfUnchanged({ key: 'recovery.test', value: '{"version":3}', expectedUpdatedAt: first.currentUpdatedAt })).rejects.toThrow(/suspendida/);
    } finally { prepare.mockRestore(); }
    expect((await persistence.checkSqliteHealth()).ok).toBe(true);
    expect(persistence.getSqliteStatus()).toMatchObject({ ready: true, databaseUuid: initial.databaseUuid });
    const snapshot = await persistence.getPersistedRecordSnapshot('recovery.test');
    expect(snapshot.record?.value).toBe('{"version":1}');
    expect(snapshot.record?.updatedAt).toBe(first.currentUpdatedAt);
    const explicit = await persistence.savePersistedRecordIfUnchanged({ key: 'recovery.test', value: '{"version":4}', expectedUpdatedAt: first.currentUpdatedAt });
    expect(explicit.ok).toBe(true);
  }, 30_000);

  it('un fallo aislado de stat se recupera sin cambiar la identidad', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    const initial = await persistence.initializeSqlitePersistence();
    testContext.failStatPath = layout.databasePath;
    testContext.statFailures = 1;
    expect((await persistence.checkSqliteHealth()).ok).toBe(false);
    expect((await persistence.checkSqliteHealth()).ok).toBe(true);
    expect(persistence.getSqliteStatus()).toMatchObject({ ready: true, databaseUuid: initial.databaseUuid });
  }, 25_000);

  it('suspende la edición tras tres fallos consecutivos de stat y verifica la reapertura', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await importPersistence();
    const initial = await persistence.initializeSqlitePersistence();
    const saved = await persistence.savePersistedRecordIfUnchanged({ key: 'stat.test', value: '{"saved":true}', expectedUpdatedAt: null });
    expect(saved.ok).toBe(true);
    testContext.failStatPath = layout.databasePath;
    testContext.statFailures = 3;
    for (let i = 0; i < 3; i++) expect((await persistence.checkSqliteHealth()).ok).toBe(false);
    expect(persistence.getSqliteStatus()).toMatchObject({ ready: false, phase: 'fallback' });
    await expect(persistence.savePersistedRecordIfUnchanged({ key: 'stat.test', value: '{}', expectedUpdatedAt: saved.currentUpdatedAt })).rejects.toThrow(/suspendida/);
    expect((await persistence.checkSqliteHealth()).ok).toBe(true);
    expect(persistence.getSqliteStatus()).toMatchObject({ ready: true, databaseUuid: initial.databaseUuid });
    expect((await persistence.getPersistedRecordSnapshot('stat.test')).record?.value).toBe('{"saved":true}');
  }, 30_000);
});
