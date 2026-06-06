import { app } from 'electron';
import { copyFile, mkdir, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Database, DatabaseConstructor } from 'better-sqlite3';

const DATABASE_FILE_NAME = 'traccion.sqlite';
const CURRENT_SCHEMA_VERSION = 1;

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface DatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback';
  path: string;
  schemaVersion: number;
  message?: string;
}

interface SchemaMigrationRow {
  version: number;
}

const require = createRequire(import.meta.url);

let database: Database | null = null;
let status: DatabaseStatus | null = null;

function isSchemaMigrationRow(value: unknown): value is SchemaMigrationRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SchemaMigrationRow>;
  return typeof candidate.version === 'number';
}

function getDatabasePath(): string {
  return path.join(app.getPath('userData'), 'data', DATABASE_FILE_NAME);
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

export async function initializeSqlitePersistence(): Promise<DatabaseStatus> {
  if (status) {
    return status;
  }

  const databasePath = getDatabasePath();

  try {
    await mkdir(path.dirname(databasePath), { recursive: true });
    await backupExistingDatabase(databasePath);

    const BetterSqlite3 = require('better-sqlite3') as DatabaseConstructor;
    const db = new BetterSqlite3(databasePath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    applyMigrations(db);

    database = db;
    status = {
      ready: true,
      engine: 'better-sqlite3',
      phase: 'active',
      path: databasePath,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
  } catch (error) {
    status = {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'fallback',
      path: databasePath,
      schemaVersion: 0,
      message:
        error instanceof Error
          ? error.message
          : 'SQLite no está disponible; se mantiene localStorage.',
    };
  }

  return status;
}

function requireDatabase(): Database {
  if (!database) {
    throw new Error('SQLite no está inicializado.');
  }

  return database;
}

export function getSqliteStatus(): DatabaseStatus {
  return (
    status ?? {
      ready: false,
      engine: 'better-sqlite3',
      phase: 'prepared',
      path: getDatabasePath(),
      schemaVersion: 0,
    }
  );
}

export function savePersistedRecord(record: PersistedStorageRecord): DatabaseStatus {
  const currentStatus = getSqliteStatus();
  if (!currentStatus.ready) {
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
  if (!currentStatus.ready) {
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
