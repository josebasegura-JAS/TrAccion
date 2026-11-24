import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateSqliteDatabase } from './databaseActivation.js';

const mocks = vi.hoisted(() => {
  const identity = { applicationId: 'TrAccion', databaseUuid: 'expected', createdAt: '2026-01-01', environment: 'production' };
  const close = vi.fn();
  const run = vi.fn();
  const db = { close, prepare: vi.fn(() => ({ run })) };
  return {
    identity, db, close, run,
    stat: vi.fn(async () => ({ isFile: () => true })),
    ensure: vi.fn(async () => undefined),
    prepareFile: vi.fn(async () => undefined),
    preferences: vi.fn(async () => ({ expectedDatabaseUuid: null as string | null })),
    write: vi.fn(async () => undefined),
    inspect: vi.fn(() => ({ identity, bootstrappedLegacyIdentity: false })),
    readIdentity: vi.fn(() => identity as typeof identity | null),
    openDb: vi.fn(() => db),
    assertEnvironment: vi.fn(),
  };
});
vi.mock('node:fs/promises', () => ({ stat: mocks.stat, open: vi.fn() }));
vi.mock('./databaseFileSystem.js', () => ({ ensureDirectoryIsUsable: mocks.ensure, prepareDatabaseFile: mocks.prepareFile }));
vi.mock('./databasePreferences.js', () => ({
  getDatabasePathForDirectory: (dir: string) => dir + '/traccion.sqlite',
  readDatabasePreferences: mocks.preferences, writeDatabasePreferences: mocks.write,
}));
vi.mock('./databaseIdentity.js', () => ({
  inspectAndEnsureDatabaseIdentity: mocks.inspect,
  assertDatabaseEnvironmentBeforeWrite: mocks.assertEnvironment,
  readDatabaseIdentity: mocks.readIdentity,
}));
vi.mock('./sqliteConnection.js', () => ({ openSqliteDatabase: mocks.openDb }));
vi.mock('./schemaMigrations.js', () => ({ CURRENT_SCHEMA_VERSION: 19 }));
vi.mock('./traccionEnvironment.js', () => ({ getTraccionEnvironment: () => 'production' }));

const lock = { ownerId: 'owner', username: 'test', hostname: 'test', pid: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const acquire = vi.fn(async () => lock);
const heartbeat = vi.fn(() => setInterval(() => undefined, 10_000));
const release = vi.fn(async () => undefined);
const deps = {
  ownerId: 'owner', busyTimeoutMs: 1000, getLockPath: (file: string) => file + '.lockdir',
  acquireStartupLock: acquire, startDatabaseLockHeartbeat: heartbeat, releaseLock: release,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.preferences.mockResolvedValue({ expectedDatabaseUuid: null });
  mocks.readIdentity.mockReturnValue(mocks.identity);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('activación segura de SQLite', () => {
  it('transfiere la conexión al llamador solamente si termina correctamente', async () => {
    const result = await activateSqliteDatabase('/shared', false, null, deps);
    expect(result.database).toBe(mocks.db);
    expect(result.status).toMatchObject({ ready: true, databaseUuid: 'expected' });
    expect(mocks.close).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cierra el handle si falla la escritura de preferencias', async () => {
    const error = new Error('disco lleno');
    mocks.write.mockRejectedValueOnce(error);
    await expect(activateSqliteDatabase('/shared', false, null, deps)).rejects.toBe(error);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cierra el handle y no acepta una identidad desaparecida después de abrir', async () => {
    mocks.readIdentity.mockReturnValueOnce(null);
    await expect(activateSqliteDatabase('/shared', false, null, deps)).rejects.toThrow(/identidad SQLite cambió/);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('libera el bloqueo incluso si falla el inicio del heartbeat', async () => {
    const error = new Error('heartbeat no disponible');
    heartbeat.mockImplementationOnce(() => { throw error; });
    await expect(activateSqliteDatabase('/shared', false, null, deps)).rejects.toBe(error);
    expect(release).toHaveBeenCalledTimes(1);
    expect(mocks.openDb).not.toHaveBeenCalled();
  });
  it('no oculta el fallo original aunque falle también la limpieza', async () => {
    const error = new Error('preferencias');
    mocks.write.mockRejectedValueOnce(error);
    mocks.close.mockImplementationOnce(() => { throw new Error('close'); });
    release.mockRejectedValueOnce(new Error('release'));
    await expect(activateSqliteDatabase('/shared', false, null, deps)).rejects.toBe(error);
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
  it('una base vinculada no recibe permiso de bootstrap de identidad', async () => {
    mocks.preferences.mockResolvedValueOnce({ expectedDatabaseUuid: 'expected' });
    await activateSqliteDatabase('/shared', false, null, deps);
    expect(mocks.inspect).toHaveBeenCalledWith('/shared/traccion.sqlite', expect.objectContaining({ expectedDatabaseUuid: 'expected', allowLegacyBootstrap: false }));
  });
});
