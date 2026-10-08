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
      message: 'not-used-in-coordination-occ-test',
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
  const root = mkdtempSync(path.join(tmpdir(), 'traccion-coordination-occ-'));
  const userData = path.join(root, 'user-data');
  const sharedDirectory = path.join(root, 'shared');
  const databasePath = path.join(sharedDirectory, 'traccion.sqlite');
  mkdirSync(userData, { recursive: true });
  mkdirSync(sharedDirectory, { recursive: true });
  return { root, userData, sharedDirectory, databasePath };
}

function writePreferences(userData: string, sharedDirectory: string): void {
  writeFileSync(
    path.join(userData, 'sqlite-preferences.json'),
    JSON.stringify({
      customDirectoryPath: sharedDirectory,
      secondaryBackupDirectoryPath: null,
      dailyLocalBackupEnabled: true,
      dailyLocalBackupRetentionDays: 7,
      dailyLocalBackupDirectoryPath: null,
      updatesDirectoryPath: null,
      expectedDatabaseUuid: null,
    }),
    'utf8',
  );
}

function createSharedDatabase(databasePath: string): void {
  const db = openSqliteDatabase(databasePath, { busyTimeoutMs: 5_000 });
  db.close();
}

describe('Coordinación granular — OCC real sobre persisted_records', () => {
  let layout: TestLayout;

  beforeEach(() => {
    layout = createTestLayout();
    testContext.userDataPath = layout.userData;
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(layout.root, { recursive: true, force: true });
  });

  it('permite editar dos reuniones distintas con tokens independientes', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const keyA = 'traccion.v1.coordinacion.meeting.meeting-a';
    const keyB = 'traccion.v1.coordinacion.meeting.meeting-b';
    const firstA = await persistence.savePersistedRecordIfUnchanged({
      key: keyA,
      value: JSON.stringify({ id: 'meeting-a', version: 1 }),
      expectedUpdatedAt: null,
    });
    const firstB = await persistence.savePersistedRecordIfUnchanged({
      key: keyB,
      value: JSON.stringify({ id: 'meeting-b', version: 1 }),
      expectedUpdatedAt: null,
    });

    expect(firstA.ok).toBe(true);
    expect(firstB.ok).toBe(true);

    const secondA = await persistence.savePersistedRecordIfUnchanged({
      key: keyA,
      value: JSON.stringify({ id: 'meeting-a', version: 2 }),
      expectedUpdatedAt: firstA.currentUpdatedAt,
    });
    const secondB = await persistence.savePersistedRecordIfUnchanged({
      key: keyB,
      value: JSON.stringify({ id: 'meeting-b', version: 2 }),
      expectedUpdatedAt: firstB.currentUpdatedAt,
    });

    expect(secondA.ok).toBe(true);
    expect(secondB.ok).toBe(true);
    await persistence.closeSqlitePersistence();
  });

  it('rechaza la segunda edición si dos sesiones parten de la misma versión de una reunión', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const key = 'traccion.v1.coordinacion.meeting.meeting-a';
    const initial = await persistence.savePersistedRecordIfUnchanged({
      key,
      value: JSON.stringify({ id: 'meeting-a', editor: 'base' }),
      expectedUpdatedAt: null,
    });
    expect(initial.ok).toBe(true);

    const sessionOne = await persistence.savePersistedRecordIfUnchanged({
      key,
      value: JSON.stringify({ id: 'meeting-a', editor: 'one' }),
      expectedUpdatedAt: initial.currentUpdatedAt,
    });
    expect(sessionOne.ok).toBe(true);

    const sessionTwo = await persistence.savePersistedRecordIfUnchanged({
      key,
      value: JSON.stringify({ id: 'meeting-a', editor: 'two' }),
      expectedUpdatedAt: initial.currentUpdatedAt,
    });

    expect(sessionTwo.ok).toBe(false);
    expect(sessionTwo.currentUpdatedAt).toBe(sessionOne.currentUpdatedAt);
    expect(sessionTwo.message).toContain('han cambiado mientras guardabas');

    const snapshot = await persistence.getPersistedRecordSnapshot(key);
    expect(snapshot.record?.value).toBe(JSON.stringify({ id: 'meeting-a', editor: 'one' }));
    await persistence.closeSqlitePersistence();
  });
});
