import { app } from 'electron';
import { copyFile, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { hostname, userInfo } from 'node:os';
import path from 'node:path';
import type { Database, DatabaseConstructor } from 'better-sqlite3';

const DATABASE_FILE_NAME = 'traccion.sqlite';
const DATABASE_PREFERENCES_FILE_NAME = 'sqlite-preferences.json';
const CURRENT_SCHEMA_VERSION = 1;
const LOCK_TTL_MS = 2 * 60 * 1000;

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface DatabaseLockInfo {
  ownerId: string;
  username: string;
  hostname: string;
  pid: number;
  createdAt: string;
  updatedAt: string;
}

export interface DatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  lock?: DatabaseLockInfo;
  message?: string;
}

interface SchemaMigrationRow {
  version: number;
}

interface DatabasePreferences {
  customDirectoryPath: string | null;
}

const require = createRequire(import.meta.url);
const ownerId = `${hostname()}-${process.pid}-${Date.now().toString(36)}`;

let database: Database | null = null;
let status: DatabaseStatus | null = null;
let activeLockPath: string | null = null;
let activeLock: DatabaseLockInfo | null = null;
let lockHeartbeat: NodeJS.Timeout | null = null;

function isSchemaMigrationRow(value: unknown): value is SchemaMigrationRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SchemaMigrationRow>;
  return typeof candidate.version === 'number';
}

function getDefaultDatabaseDirectory(): string {
  return path.join(app.getPath('userData'), 'data');
}

function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), DATABASE_PREFERENCES_FILE_NAME);
}

function getDatabasePathForDirectory(directoryPath: string): string {
  return path.join(directoryPath, DATABASE_FILE_NAME);
}

async function readDatabasePreferences(): Promise<DatabasePreferences> {
  try {
    const raw = await readFile(getPreferencesPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { customDirectoryPath: null };
    }

    const candidate = parsed as Partial<DatabasePreferences>;
    return {
      customDirectoryPath:
        typeof candidate.customDirectoryPath === 'string' && candidate.customDirectoryPath.trim()
          ? candidate.customDirectoryPath
          : null,
    };
  } catch {
    return { customDirectoryPath: null };
  }
}

async function writeDatabasePreferences(preferences: DatabasePreferences): Promise<void> {
  await mkdir(path.dirname(getPreferencesPath()), { recursive: true });
  await writeFile(getPreferencesPath(), JSON.stringify(preferences, null, 2), 'utf8');
}

async function getConfiguredDatabaseDirectory(): Promise<{
  directoryPath: string;
  isDefaultPath: boolean;
}> {
  const preferences = await readDatabasePreferences();
  if (preferences.customDirectoryPath) {
    return { directoryPath: preferences.customDirectoryPath, isDefaultPath: false };
  }

  return { directoryPath: getDefaultDatabaseDirectory(), isDefaultPath: true };
}

function getLockPath(databasePath: string): string {
  return `${databasePath}.lock`;
}

function createLockInfo(): DatabaseLockInfo {
  let username = 'desconocido';
  try {
    username = userInfo().username;
  } catch {
    username = 'desconocido';
  }

  const now = new Date().toISOString();
  return {
    ownerId,
    username,
    hostname: hostname(),
    pid: process.pid,
    createdAt: now,
    updatedAt: now,
  };
}

function isDatabaseLockInfo(value: unknown): value is DatabaseLockInfo {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof DatabaseLockInfo, unknown>>;
  return (
    typeof candidate.ownerId === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.hostname === 'string' &&
    typeof candidate.pid === 'number' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  );
}

function isLockStale(lock: DatabaseLockInfo): boolean {
  const updatedAt = Date.parse(lock.updatedAt);
  return Number.isNaN(updatedAt) || Date.now() - updatedAt > LOCK_TTL_MS;
}

async function readLock(lockPath: string): Promise<DatabaseLockInfo | null> {
  try {
    const raw = await readFile(lockPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    return isDatabaseLockInfo(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  await writeFile(lockPath, JSON.stringify(lock, null, 2), { encoding: 'utf8', flag: 'wx' });
}

async function refreshLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  const nextLock = { ...lock, updatedAt: new Date().toISOString() };
  await writeFile(lockPath, JSON.stringify(nextLock, null, 2), 'utf8');
  activeLock = nextLock;
}

async function removeLock(lockPath: string, expectedOwnerId: string): Promise<void> {
  const lock = await readLock(lockPath);
  if (lock?.ownerId === expectedOwnerId) {
    await unlink(lockPath).catch(() => undefined);
  }
}

async function acquireLock(databasePath: string): Promise<DatabaseLockInfo> {
  const lockPath = getLockPath(databasePath);
  await mkdir(path.dirname(lockPath), { recursive: true });
  const existingLock = await readLock(lockPath);
  if (existingLock && existingLock.ownerId !== ownerId && !isLockStale(existingLock)) {
    throw new Error(
      `Base ocupada por ${existingLock.username}@${existingLock.hostname} (PID ${existingLock.pid}).`,
    );
  }

  if (existingLock && isLockStale(existingLock)) {
    await unlink(lockPath).catch(() => undefined);
  }

  const lock = createLockInfo();
  try {
    await writeLock(lockPath, lock);
  } catch {
    const racedLock = await readLock(lockPath);
    if (racedLock?.ownerId === ownerId) {
      return racedLock;
    }
    if (racedLock && !isLockStale(racedLock)) {
      throw new Error(
        `Base ocupada por ${racedLock.username}@${racedLock.hostname} (PID ${racedLock.pid}).`,
      );
    }
    await unlink(lockPath).catch(() => undefined);
    await writeLock(lockPath, lock);
  }

  return lock;
}

function startLockHeartbeat(lockPath: string, lock: DatabaseLockInfo): void {
  if (lockHeartbeat) {
    clearInterval(lockHeartbeat);
  }

  activeLockPath = lockPath;
  activeLock = lock;
  lockHeartbeat = setInterval(
    () => {
      if (!activeLock) {
        return;
      }
      refreshLock(lockPath, activeLock).catch(() => undefined);
    },
    Math.floor(LOCK_TTL_MS / 3),
  );
}

async function releaseActiveLock(): Promise<void> {
  if (lockHeartbeat) {
    clearInterval(lockHeartbeat);
    lockHeartbeat = null;
  }

  if (activeLockPath && activeLock) {
    await removeLock(activeLockPath, activeLock.ownerId);
  }

  activeLockPath = null;
  activeLock = null;
}

async function backupExistingDatabase(databasePath: string): Promise<void> {
  try {
    await stat(databasePath);
  } catch {
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await copyFile(databasePath, `${databasePath}.backup-${timestamp}`);
}

async function ensureDirectoryIsUsable(directoryPath: string): Promise<void> {
  await mkdir(directoryPath, { recursive: true });
  await access(directoryPath, constants.R_OK | constants.W_OK);
  const probePath = path.join(directoryPath, `.traccion-write-test-${process.pid}-${Date.now()}`);
  await writeFile(probePath, 'ok', { encoding: 'utf8', flag: 'wx' });
  await unlink(probePath);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function readCurrentSchemaVersion(db: Database): number {
  const row = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get();

  return isSchemaMigrationRow(row) ? row.version : 0;
}

function migrateToVersion1(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS persisted_records (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'localStorage',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_storage_backups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 1) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      1,
      new Date().toISOString(),
    );
  }
}

function applyMigrations(db: Database): void {
  migrateToVersion1(db);
}

function openDatabase(databasePath: string): Database {
  const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
  const db = new BetterSqlite3(databasePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  return db;
}

function closeDatabase(): void {
  if (!database) {
    return;
  }

  database.pragma('wal_checkpoint(TRUNCATE)');
  database.close();
  database = null;
}

async function prepareDatabaseAtPath(
  databasePath: string,
  sourceDatabasePath: string | null,
): Promise<void> {
  const targetExists = await fileExists(databasePath);
  if (targetExists) {
    return;
  }

  if (
    sourceDatabasePath &&
    sourceDatabasePath !== databasePath &&
    (await fileExists(sourceDatabasePath))
  ) {
    await copyFile(sourceDatabasePath, databasePath);
  }
}

async function activateDatabase(
  directoryPath: string,
  isDefaultPath: boolean,
  sourceDatabasePath: string | null,
): Promise<DatabaseStatus> {
  const databasePath = getDatabasePathForDirectory(directoryPath);
  const lockPath = getLockPath(databasePath);
  await ensureDirectoryIsUsable(directoryPath);
  const lock = await acquireLock(databasePath);

  try {
    await prepareDatabaseAtPath(databasePath, sourceDatabasePath);
    await backupExistingDatabase(databasePath);
    const db = openDatabase(databasePath);
    database = db;
    startLockHeartbeat(lockPath, lock);
    status = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isDefaultPath,
      lockPath,
      lock,
    };
    return status;
  } catch (error) {
    await removeLock(lockPath, lock.ownerId);
    throw error;
  }
}

export async function initializeSqlitePersistence(): Promise<DatabaseStatus> {
  if (status) {
    return status;
  }

  const configured = await getConfiguredDatabaseDirectory();
  const databasePath = getDatabasePathForDirectory(configured.directoryPath);
  const lockPath = getLockPath(databasePath);

  try {
    return await activateDatabase(configured.directoryPath, configured.isDefaultPath, null);
  } catch (error) {
    const currentLock = await readLock(lockPath);
    status = {
      ready: false,
      engine: 'better-sqlite3',
      phase:
        error instanceof Error && error.message.startsWith('Base ocupada') ? 'locked' : 'fallback',
      path: databasePath,
      schemaVersion: 0,
      isDefaultPath: configured.isDefaultPath,
      lockPath,
      lock: currentLock ?? undefined,
      message:
        error instanceof Error
          ? error.message
          : 'SQLite no está disponible; se mantiene localStorage.',
    };
  }

  return getSqliteStatus();
}

function requireDatabase(): Database {
  if (!database) {
    throw new Error('SQLite no está inicializado.');
  }

  return database;
}

export function getSqliteStatus(): DatabaseStatus {
  const fallbackPath = getDatabasePathForDirectory(getDefaultDatabaseDirectory());
  return (
    status ?? {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'prepared',
      path: fallbackPath,
      schemaVersion: 0,
      isDefaultPath: true,
      lockPath: getLockPath(fallbackPath),
    }
  );
}

export function savePersistedRecord(record: PersistedStorageRecord): DatabaseStatus {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return currentStatus;
  }

  const now = new Date().toISOString();
  requireDatabase()
    .prepare(
      `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
       VALUES (?, ?, 'localStorage', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         source = excluded.source,
         updated_at = excluded.updated_at`,
    )
    .run(record.key, record.value, now, now);

  return currentStatus;
}

export function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): DatabaseStatus {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return currentStatus;
  }

  const db = requireDatabase();
  const now = new Date().toISOString();
  const records = payload.records.filter(
    (record): record is PersistedStorageRecord =>
      typeof record.key === 'string' && typeof record.value === 'string',
  );

  db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)').run(
    now,
    JSON.stringify({ records }),
  );

  const upsert = db.prepare(
    `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
     VALUES (?, ?, 'localStorage', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value_json = excluded.value_json,
       source = excluded.source,
       updated_at = excluded.updated_at`,
  );

  for (const record of records) {
    upsert.run(record.key, record.value, now, now);
  }

  return currentStatus;
}

export async function changeSqliteDirectory(directoryPath: string): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const normalizedDirectoryPath = path.resolve(directoryPath);
  const nextDatabasePath = getDatabasePathForDirectory(normalizedDirectoryPath);

  if (previousStatus.ready && previousStatus.path === nextDatabasePath) {
    return previousStatus;
  }

  try {
    if (database) {
      database.pragma('wal_checkpoint(TRUNCATE)');
      await backupExistingDatabase(previousStatus.path);
    }

    closeDatabase();
    await releaseActiveLock();

    try {
      const nextStatus = await activateDatabase(
        normalizedDirectoryPath,
        false,
        previousDatabasePath,
      );
      await writeDatabasePreferences({ customDirectoryPath: normalizedDirectoryPath });
      return nextStatus;
    } catch (changeError) {
      if (previousStatus.ready) {
        try {
          const restoredDirectory = path.dirname(previousStatus.path);
          const restoredStatus = await activateDatabase(
            restoredDirectory,
            previousStatus.isDefaultPath,
            null,
          );
          status = { ...restoredStatus, message: errorMessage(changeError) };
          return status;
        } catch {
          status = {
            ...previousStatus,
            ready: false,
            phase: 'fallback',
            message: errorMessage(changeError),
          };
          return status;
        }
      }

      throw changeError;
    }
  } catch (error) {
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

export async function resetSqliteDirectory(): Promise<DatabaseStatus> {
  const previousStatus = getSqliteStatus();
  const previousDatabasePath = database ? previousStatus.path : null;
  const defaultDirectory = getDefaultDatabaseDirectory();

  try {
    if (database) {
      database.pragma('wal_checkpoint(TRUNCATE)');
      await backupExistingDatabase(previousStatus.path);
    }
    closeDatabase();
    await releaseActiveLock();
    const nextStatus = await activateDatabase(defaultDirectory, true, previousDatabasePath);
    await writeDatabasePreferences({ customDirectoryPath: null });
    return nextStatus;
  } catch (error) {
    try {
      if (previousStatus.ready) {
        const restoredStatus = await activateDatabase(
          path.dirname(previousStatus.path),
          previousStatus.isDefaultPath,
          null,
        );
        status = { ...restoredStatus, message: errorMessage(error) };
        return status;
      }
    } catch {
      // Mantener el fallback existente.
    }
    status = { ...previousStatus, message: errorMessage(error) };
    return status;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'No se ha podido cambiar la ruta SQLite.';
}

export async function closeSqlitePersistence(): Promise<void> {
  closeDatabase();
  await releaseActiveLock();
}
