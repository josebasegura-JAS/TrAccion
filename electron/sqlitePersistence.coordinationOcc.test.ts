import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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

let templateRoot: string;
let templateDbPath: string;

beforeAll(() => {
  templateRoot = mkdtempSync(path.join(tmpdir(), 'traccion-coordination-occ-schema-'));
  templateDbPath = path.join(templateRoot, 'seed.sqlite');
  const db = openSqliteDatabase(templateDbPath, { busyTimeoutMs: 5_000 });
  db.close();
});

afterAll(() => {
  if (templateRoot) rmSync(templateRoot, { recursive: true, force: true });
});

function createSharedDatabase(databasePath: string): void {
  copyFileSync(templateDbPath, databasePath);
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

  it('cierra reunión, índice y tareas en una única transacción', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-atomic';
    const indexKey = 'traccion.v1.coordinacion.index';
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: JSON.stringify({ id: 'meeting-atomic', status: 'open' }), expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-atomic'] }), expectedUpdatedAt: null });
    const taskValue = JSON.stringify({ id: 'task-atomic', updatedAt: '2026-10-14T04:00:00.000Z', deletedAt: null, estado: 'pendiente' });
    const task = await persistence.saveTaskRecordIfUnchanged({ id: 'task-atomic', value: taskValue, expectedUpdatedAt: null });
    expect(meeting.ok && index.ok && task.ok).toBe(true);

    const closedTaskValue = JSON.stringify({ id: 'task-atomic', updatedAt: '2026-10-14T05:00:00.000Z', deletedAt: null, estado: 'cerrada' });
    const result = await persistence.closeCoordinationWorkflowAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-atomic', status: 'closed' }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-atomic'], directionTaskIds: [] }), expectedUpdatedAt: index.currentUpdatedAt! },
      tasks: [{ id: 'task-atomic', value: closedTaskValue, expectedUpdatedAt: task.currentUpdatedAt }],
    });
    expect(result.ok).toBe(true);
    expect((await persistence.getPersistedRecordSnapshot(meetingKey)).record?.value).toContain('closed');
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toContain('directionTaskIds');
    const taskSnapshot = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(taskSnapshot.records.find((record) => record.id === 'task-atomic')?.value).toBe(closedTaskValue);
    await persistence.closeSqlitePersistence();
  });

  it('si una tarea tiene un token obsoleto no cierra ni la reunión ni el índice', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-conflict';
    const indexKey = 'traccion.v1.coordinacion.index';
    const openMeeting = JSON.stringify({ id: 'meeting-conflict', status: 'open' });
    const openIndex = JSON.stringify({ meetingIds: ['meeting-conflict'], directionTaskIds: ['task-conflict'] });
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: openMeeting, expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: openIndex, expectedUpdatedAt: null });
    const firstTask = await persistence.saveTaskRecordIfUnchanged({ id: 'task-conflict', value: JSON.stringify({ id: 'task-conflict', updatedAt: '2026-10-14T04:00:00.000Z', deletedAt: null }), expectedUpdatedAt: null });
    const secondTask = await persistence.saveTaskRecordIfUnchanged({ id: 'task-conflict', value: JSON.stringify({ id: 'task-conflict', updatedAt: '2026-10-14T04:30:00.000Z', deletedAt: null }), expectedUpdatedAt: firstTask.currentUpdatedAt });
    expect(secondTask.ok).toBe(true);

    const result = await persistence.closeCoordinationWorkflowAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-conflict', status: 'closed' }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-conflict'], directionTaskIds: [] }), expectedUpdatedAt: index.currentUpdatedAt! },
      tasks: [{ id: 'task-conflict', value: JSON.stringify({ id: 'task-conflict', updatedAt: '2026-10-14T05:00:00.000Z', deletedAt: null, estado: 'cerrada' }), expectedUpdatedAt: firstTask.currentUpdatedAt }],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('tareas seleccionadas');
    expect((await persistence.getPersistedRecordSnapshot(meetingKey)).record?.value).toBe(openMeeting);
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toBe(openIndex);
    await persistence.closeSqlitePersistence();
  });


  it('crea la tarea y la vincula con reunión e índice en una única transacción', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-create-task';
    const indexKey = 'traccion.v1.coordinacion.index';
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: JSON.stringify({ id: 'meeting-create-task', points: [] }), expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-task'], directionTaskIds: [] }), expectedUpdatedAt: null });
    expect(meeting.ok && index.ok).toBe(true);

    const taskValue = JSON.stringify({ id: 'task-created-atomic', titulo: 'Nueva', updatedAt: '2026-10-14T06:00:00.000Z', createdAt: '2026-10-14T06:00:00.000Z', deletedAt: null });
    const result = await persistence.createCoordinationTaskAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-create-task', points: [{ taskId: 'task-created-atomic' }] }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-task'], directionTaskIds: ['task-created-atomic'] }), expectedUpdatedAt: index.currentUpdatedAt! },
      task: { id: 'task-created-atomic', value: taskValue },
    });

    expect(result.ok).toBe(true);
    expect((await persistence.getPersistedRecordSnapshot(meetingKey)).record?.value).toContain('task-created-atomic');
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toContain('task-created-atomic');
    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.find((record) => record.id === 'task-created-atomic')?.value).toBe(taskValue);
    await persistence.closeSqlitePersistence();
  });

  it('si la reunión cambió no crea la tarea ni modifica el índice', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-create-conflict';
    const indexKey = 'traccion.v1.coordinacion.index';
    const initialMeeting = JSON.stringify({ id: 'meeting-create-conflict', points: [] });
    const initialIndex = JSON.stringify({ meetingIds: ['meeting-create-conflict'], directionTaskIds: [] });
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: initialMeeting, expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: initialIndex, expectedUpdatedAt: null });
    const newerMeeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: JSON.stringify({ id: 'meeting-create-conflict', points: [{ id: 'remote' }] }), expectedUpdatedAt: meeting.currentUpdatedAt });
    expect(newerMeeting.ok).toBe(true);

    const result = await persistence.createCoordinationTaskAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-create-conflict', points: [{ taskId: 'task-should-not-exist' }] }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-conflict'], directionTaskIds: ['task-should-not-exist'] }), expectedUpdatedAt: index.currentUpdatedAt! },
      task: { id: 'task-should-not-exist', value: JSON.stringify({ id: 'task-should-not-exist', createdAt: '2026-10-14T06:00:00.000Z', updatedAt: '2026-10-14T06:00:00.000Z', deletedAt: null }) },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('reunión');
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toBe(initialIndex);
    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.some((record) => record.id === 'task-should-not-exist')).toBe(false);
    await persistence.closeSqlitePersistence();
  });


  it('importa puntos y sesiones históricas en una única transacción e idempotentemente', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const now = new Date().toISOString();
    const taskValue = JSON.stringify({ id: 'hist-task-1', titulo: 'Punto histórico', observaciones: 'ImportKey:T-1', createdAt: now, updatedAt: now, deletedAt: null });
    const sessionValue = JSON.stringify({ id: 'hist-session-1', code: 'C-2025-01', date: '2025-01-10', notes: 'ImportKey:S-1', items: [], treatedTaskIds: [], untreatedTaskIds: [], createdAt: now, updatedAt: now, closedAt: now });
    const payload = { module: 'comite' as const, tasks: [{ externalKey: 'T-1', id: 'hist-task-1', value: taskValue }], sessions: [{ externalKey: 'S-1', id: 'hist-session-1', value: sessionValue, taskExternalKeys: ['T-1'] }] };

    const first = await persistence.importSessionHistoryAtomically(payload);
    expect(first.ok).toBe(true);
    expect(first.createdTaskCount).toBe(1);
    expect(first.importedSessionCount).toBe(1);

    const second = await persistence.importSessionHistoryAtomically(payload);
    expect(second.ok).toBe(true);
    expect(second.createdTaskCount).toBe(0);
    expect(second.importedSessionCount).toBe(0);

    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.filter((record) => record.id === 'hist-task-1')).toHaveLength(1);
    const sessions = await persistence.loadComiteSessionRecordsSnapshot();
    const sessionRecord = sessions.records.find((record) => record.id === 'hist-session-1');
    expect(sessionRecord).toBeDefined();
    expect((JSON.parse(sessionRecord!.value) as { items: string[] }).items).toEqual(['hist-task-1']);
    await persistence.closeSqlitePersistence();
  });

  it('revierte también los puntos si falla la inserción de una sesión histórica', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const now = new Date().toISOString();
    const seeded = await persistence.saveComiteSessionRecordIfUnchanged({
      id: 'collision',
      value: JSON.stringify({ id: 'collision', code: 'OTHER', date: '2024-01-01', notes: '', createdAt: now, updatedAt: now, deletedAt: null }),
      expectedUpdatedAt: null,
    });
    expect(seeded.ok).toBe(true);

    const result = await persistence.importSessionHistoryAtomically({
      module: 'comite',
      tasks: [{ externalKey: 'ROLL-T', id: 'rollback-task', value: JSON.stringify({ id: 'rollback-task', observaciones: 'ImportKey:ROLL-T', createdAt: now, updatedAt: now, deletedAt: null }) }],
      sessions: [{ externalKey: 'ROLL-S', id: 'collision', value: JSON.stringify({ id: 'collision', code: 'NEW', date: '2025-02-01', notes: 'ImportKey:ROLL-S', createdAt: now, updatedAt: now, closedAt: now }), taskExternalKeys: ['ROLL-T'] }],
    });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('mismo identificador');

    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.some((record) => record.id === 'rollback-task')).toBe(false);
    await persistence.closeSqlitePersistence();
  });

});
