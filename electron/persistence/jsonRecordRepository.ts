import type { Database } from 'better-sqlite3';

export interface SqliteJsonRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

interface JsonRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface CountRow {
  count: number;
}

interface PersistedRecordRow {
  key: string;
  value_json: string;
  updated_at: string;
}

export interface JsonArrayMigrationOptions {
  tableName: string;
  legacyKey: string;
  migrationDone: boolean;
}

function assertSafeSqlIdentifier(identifier: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(identifier)) {
    throw new Error(`Identificador SQL no permitido: ${identifier}`);
  }
}

function isJsonRecordRow(value: unknown): value is JsonRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<JsonRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function isCountRow(value: unknown): value is CountRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CountRow>;
  return typeof candidate.count === 'number';
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

function isJsonObjectWithStringId(value: unknown): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0;
}

function mapJsonRecordRow(row: JsonRecordRow): SqliteJsonRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readPersistedRecordByKey(db: Database, key: string): PersistedRecordRow | null {
  const row = db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records WHERE key = ?')
    .get(key);

  return isPersistedRecordRow(row) ? row : null;
}

export function readActiveJsonRecords(db: Database, tableName: string): SqliteJsonRecord[] {
  assertSafeSqlIdentifier(tableName);

  return db
    .prepare(
      `SELECT id, value_json, created_at, updated_at, deleted_at FROM ${tableName} WHERE deleted_at IS NULL ORDER BY created_at, id`,
    )
    .all()
    .filter(isJsonRecordRow)
    .map(mapJsonRecordRow);
}

export function maybeMigrateJsonArrayRecordsFromPersistedRecord(
  db: Database,
  options: JsonArrayMigrationOptions,
): boolean {
  const { tableName, legacyKey, migrationDone } = options;
  assertSafeSqlIdentifier(tableName);

  if (migrationDone) {
    return true;
  }

  const countRow = db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get();
  const count = isCountRow(countRow) ? countRow.count : 0;
  if (count > 0) {
    return true;
  }

  const legacyRecord = readPersistedRecordByKey(db, legacyKey);
  if (!legacyRecord) {
    return true;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(legacyRecord.value_json);
  } catch {
    return true;
  }

  if (!Array.isArray(parsed)) {
    return true;
  }

  const now = new Date().toISOString();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  for (const item of parsed) {
    if (!isJsonObjectWithStringId(item)) {
      continue;
    }

    const createdAt = typeof item.createdAt === 'string' ? item.createdAt : now;
    const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
    const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
    insert.run(item.id, JSON.stringify(item), createdAt, updatedAt, deletedAt);
  }

  return true;
}
