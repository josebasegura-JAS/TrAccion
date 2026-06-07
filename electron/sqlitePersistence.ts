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
const CURRENT_SCHEMA_VERSION = 2;
const LOCK_TTL_MS = 30 * 1000;
const RECORD_LOCK_TTL_MS = 30 * 1000;

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface PersistedStorageRecordSnapshot extends PersistedStorageRecord {
  updatedAt: string;
}

export interface PersistedRecordsTokenSnapshot {
  status: DatabaseStatus;
  refreshToken: string | null;
  latestUpdatedAt: string | null;
}

export interface PersistedRecordsSnapshot extends PersistedRecordsTokenSnapshot {
  records: PersistedStorageRecordSnapshot[];
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


export interface RecordLockOwnerInfo {
  ownerId: string;
  ownerName: string;
  machineName: string;
  acquiredAt: string;
  expiresAt: string;
}

export interface RecordLockPayload {
  module: string;
  recordId: string;
}

export interface RecordLockResult {
  ok: boolean;
  status: 'acquired' | 'released' | 'locked' | 'idle' | 'error';
  lock: RecordLockOwnerInfo | null;
  message: string;
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

async function releaseLock(lockPath: string, lock: DatabaseLockInfo): Promise<void> {
  await removeLock(lockPath, lock.ownerId);
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

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
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

function migrateToVersion2(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS editing_locks (
      module TEXT NOT NULL,
      record_id TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      machine_name TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (module, record_id)
    );
  `);

  const currentVersion = readCurrentSchemaVersion(db);
  if (currentVersion < 2) {
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      2,
      new Date().toISOString(),
    );
  }
}

function applyMigrations(db: Database): void {
  migrateToVersion1(db);
  migrateToVersion2(db);
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
    status = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      isDefaultPath,
      lockPath,
    };
    await releaseLock(lockPath, lock);
    return status;
  } catch (error) {
    await releaseLock(lockPath, lock);
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

interface PersistedRecordRow {
  key: string;
  value_json: string;
  updated_at: string;
}

interface MetadataRow {
  value: string;
}

function isPersistedRecordRow(value: unknown): value is PersistedRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PersistedRecordRow>;
  return (
    typeof candidate.key === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.updated_at === 'string'
  );
}

function isMetadataRow(value: unknown): value is MetadataRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MetadataRow>;
  return typeof candidate.value === 'string';
}

function updateRefreshMetadata(db: Database, updatedAt: string): void {
  const token = `${updatedAt}:${ownerId}`;
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES ('persisted_records_refresh_token', ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(token, updatedAt);
}

function readRefreshToken(db: Database): string | null {
  const row = db
    .prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'")
    .get();
  return isMetadataRow(row) ? row.value : null;
}

export function savePersistedRecord(record: PersistedStorageRecord): DatabaseStatus {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return currentStatus;
  }

  const now = new Date().toISOString();
  const db = requireDatabase();
  db.prepare(
    `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
       VALUES (?, ?, 'localStorage', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value_json = excluded.value_json,
         source = excluded.source,
         updated_at = excluded.updated_at`,
  ).run(record.key, record.value, now, now);
  updateRefreshMetadata(db, now);

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

  createLocalStorageBackup({ records });

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

  if (records.length > 0) {
    updateRefreshMetadata(db, now);
  }

  return currentStatus;
}

export function createLocalStorageBackup(payload: LocalStorageBackupPayload): DatabaseStatus {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return currentStatus;
  }

  const records = payload.records.filter(
    (record): record is PersistedStorageRecord =>
      typeof record.key === 'string' && typeof record.value === 'string',
  );
  requireDatabase()
    .prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)')
    .run(new Date().toISOString(), JSON.stringify({ records }));

  return currentStatus;
}

export function loadPersistedRecordsSnapshot(): PersistedRecordsSnapshot {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return { status: currentStatus, records: [], refreshToken: null, latestUpdatedAt: null };
  }

  const db = requireDatabase();
  const rows = db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key')
    .all()
    .filter(isPersistedRecordRow);
  const records = rows.map((row) => ({
    key: row.key,
    value: row.value_json,
    updatedAt: row.updated_at,
  }));
  const latestUpdatedAt = records.reduce<string | null>((latest, record) => {
    if (!latest) {
      return record.updatedAt;
    }

    return Date.parse(record.updatedAt) > Date.parse(latest) ? record.updatedAt : latest;
  }, null);

  return {
    status: currentStatus,
    records,
    refreshToken: readRefreshToken(db),
    latestUpdatedAt,
  };
}

export function getPersistedRecordsTokenSnapshot(): PersistedRecordsTokenSnapshot {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return { status: currentStatus, refreshToken: null, latestUpdatedAt: null };
  }

  const db = requireDatabase();
  const latestRow = db
    .prepare('SELECT updated_at FROM persisted_records ORDER BY updated_at DESC LIMIT 1')
    .get();
  const latestUpdatedAt =
    latestRow &&
    typeof latestRow === 'object' &&
    typeof (latestRow as { updated_at?: unknown }).updated_at === 'string'
      ? (latestRow as { updated_at: string }).updated_at
      : null;

  return {
    status: currentStatus,
    refreshToken: readRefreshToken(db),
    latestUpdatedAt,
  };
}


interface EditingLockRow {
  module: string;
  record_id: string;
  owner_id: string;
  owner_name: string;
  machine_name: string;
  acquired_at: string;
  expires_at: string;
}

function isEditingLockRow(value: unknown): value is EditingLockRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EditingLockRow>;
  return (
    typeof candidate.module === 'string' &&
    typeof candidate.record_id === 'string' &&
    typeof candidate.owner_id === 'string' &&
    typeof candidate.owner_name === 'string' &&
    typeof candidate.machine_name === 'string' &&
    typeof candidate.acquired_at === 'string' &&
    typeof candidate.expires_at === 'string'
  );
}

function lockOwnerFromRow(row: EditingLockRow): RecordLockOwnerInfo {
  return {
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    machineName: row.machine_name,
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
  };
}

function currentOwnerName(): string {
  try {
    return userInfo().username || 'desconocido';
  } catch {
    return 'desconocido';
  }
}

function validateRecordLockPayload(payload: RecordLockPayload): boolean {
  return payload.module.trim().length > 0 && payload.recordId.trim().length > 0;
}

function recordLockError(message: string): RecordLockResult {
  return { ok: false, status: 'error', lock: null, message };
}

function ensureRecordLockDatabase(): Database | null {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready || currentStatus.phase === 'locked') {
    return null;
  }

  return requireDatabase();
}

function deleteExpiredRecordLocks(db: Database, now: string): void {
  db.prepare('DELETE FROM editing_locks WHERE expires_at <= ?').run(now);
}

function readRecordLockRow(
  db: Database,
  moduleName: string,
  recordId: string,
): EditingLockRow | null {
  const row = db
    .prepare('SELECT module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at FROM editing_locks WHERE module = ? AND record_id = ?')
    .get(moduleName, recordId);
  return isEditingLockRow(row) ? row : null;
}

export function acquireRecordLock(payload: RecordLockPayload): RecordLockResult {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  try {
    const db = ensureRecordLockDatabase();
    if (!db) {
      return recordLockError('SQLite no está disponible para coordinar bloqueos.');
    }

    const moduleName = payload.module.trim();
    const recordId = payload.recordId.trim();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();
    deleteExpiredRecordLocks(db, nowIso);
    const existingLock = readRecordLockRow(db, moduleName, recordId);

    if (existingLock && existingLock.owner_id !== ownerId) {
      return {
        ok: false,
        status: 'locked',
        lock: lockOwnerFromRow(existingLock),
        message: `Registro bloqueado por ${existingLock.owner_name}@${existingLock.machine_name}.`,
      };
    }

    if (existingLock) {
      db.prepare(
        `UPDATE editing_locks
         SET owner_name = ?, machine_name = ?, expires_at = ?
         WHERE module = ? AND record_id = ? AND owner_id = ?`,
      ).run(currentOwnerName(), hostname(), expiresAt, moduleName, recordId, ownerId);
    } else {
      db.prepare(
        `INSERT INTO editing_locks
         (module, record_id, owner_id, owner_name, machine_name, acquired_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(moduleName, recordId, ownerId, currentOwnerName(), hostname(), nowIso, expiresAt);
    }

    const lock = readRecordLockRow(db, moduleName, recordId);
    return {
      ok: true,
      status: 'acquired',
      lock: lock ? lockOwnerFromRow(lock) : null,
      message: 'Bloqueo adquirido.',
    };
  } catch (error) {
    return recordLockError(
      error instanceof Error ? error.message : 'No se ha podido adquirir el bloqueo del registro.',
    );
  }
}

export function heartbeatRecordLock(payload: RecordLockPayload): RecordLockResult {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  try {
    const db = ensureRecordLockDatabase();
    if (!db) {
      return recordLockError('SQLite no está disponible para renovar bloqueos.');
    }

    const moduleName = payload.module.trim();
    const recordId = payload.recordId.trim();
    const now = new Date();
    const nowIso = now.toISOString();
    const expiresAt = new Date(now.getTime() + RECORD_LOCK_TTL_MS).toISOString();
    deleteExpiredRecordLocks(db, nowIso);
    const existingLock = readRecordLockRow(db, moduleName, recordId);

    if (!existingLock) {
      return acquireRecordLock(payload);
    }

    if (existingLock.owner_id !== ownerId) {
      return {
        ok: false,
        status: 'locked',
        lock: lockOwnerFromRow(existingLock),
        message: `Registro bloqueado por ${existingLock.owner_name}@${existingLock.machine_name}.`,
      };
    }

    db.prepare(
      `UPDATE editing_locks
       SET owner_name = ?, machine_name = ?, expires_at = ?
       WHERE module = ? AND record_id = ? AND owner_id = ?`,
    ).run(currentOwnerName(), hostname(), expiresAt, moduleName, recordId, ownerId);
    const lock = readRecordLockRow(db, moduleName, recordId);

    return {
      ok: true,
      status: 'acquired',
      lock: lock ? lockOwnerFromRow(lock) : null,
      message: 'Bloqueo renovado.',
    };
  } catch (error) {
    return recordLockError(
      error instanceof Error ? error.message : 'No se ha podido renovar el bloqueo del registro.',
    );
  }
}

export function releaseRecordLock(payload: RecordLockPayload): RecordLockResult {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  try {
    const db = ensureRecordLockDatabase();
    if (!db) {
      return recordLockError('SQLite no está disponible para liberar bloqueos.');
    }

    db.prepare('DELETE FROM editing_locks WHERE module = ? AND record_id = ? AND owner_id = ?').run(
      payload.module.trim(),
      payload.recordId.trim(),
      ownerId,
    );

    return { ok: true, status: 'released', lock: null, message: 'Bloqueo liberado.' };
  } catch (error) {
    return recordLockError(
      error instanceof Error ? error.message : 'No se ha podido liberar el bloqueo del registro.',
    );
  }
}

export function getRecordLock(payload: RecordLockPayload): RecordLockResult {
  if (!validateRecordLockPayload(payload)) {
    return recordLockError('Identificador de bloqueo inválido.');
  }

  try {
    const db = ensureRecordLockDatabase();
    if (!db) {
      return recordLockError('SQLite no está disponible para consultar bloqueos.');
    }

    const nowIso = new Date().toISOString();
    deleteExpiredRecordLocks(db, nowIso);
    const existingLock = readRecordLockRow(db, payload.module.trim(), payload.recordId.trim());

    return existingLock
      ? {
          ok: existingLock.owner_id === ownerId,
          status: existingLock.owner_id === ownerId ? 'acquired' : 'locked',
          lock: lockOwnerFromRow(existingLock),
          message: 'Bloqueo activo.',
        }
      : { ok: true, status: 'idle', lock: null, message: 'Sin bloqueo activo.' };
  } catch (error) {
    return recordLockError(
      error instanceof Error ? error.message : 'No se ha podido consultar el bloqueo del registro.',
    );
  }
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
}
