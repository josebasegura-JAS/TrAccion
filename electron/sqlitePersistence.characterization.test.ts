import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openSqliteDatabase } from './persistence/sqliteConnection.js';

const testContext = vi.hoisted(() => ({ userDataPath: '' }));

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
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(layout.root, { recursive: true, force: true });
  });

  it('mantiene la edición bloqueada si no existe una ruta SQLite compartida configurada', async () => {
    writePreferences(layout.userData, null);
    const persistence = await importPersistence();

    const status = await persistence.initializeSqlitePersistence();

    expect(status.ready).toBe(false);
    expect(status.phase).toBe('fallback');
    expect(status.isDefaultPath).toBe(true);
    expect(status.message).toContain('No hay una base de datos compartida configurada');
  });

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
  });

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
});
