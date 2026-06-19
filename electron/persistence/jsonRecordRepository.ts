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


interface UpdatedAtRow {
  updated_at: string | null;
}

function isUpdatedAtRow(value: unknown): value is UpdatedAtRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<UpdatedAtRow>;
  return candidate.updated_at === null || typeof candidate.updated_at === 'string';
}

export function extractJsonRecordTimestamps(value: string): {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
} {
  const now = new Date().toISOString();
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }

  const createdAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
      ? (parsed as { createdAt: string }).createdAt
      : now;
  const updatedAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
      ? (parsed as { updatedAt: string }).updatedAt
      : now;
  const deletedAt =
    parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
      ? (parsed as { deletedAt: string }).deletedAt
      : null;

  return { createdAt, updatedAt, deletedAt };
}

export function latestUpdatedAtFromJsonTables(db: Database, tableNames: string[]): string | null {
  return tableNames.reduce<string | null>((latest, tableName) => {
    assertSafeSqlIdentifier(tableName);
    const row = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM ${tableName}`).get();
    const updatedAt = isUpdatedAtRow(row) ? row.updated_at : null;
    if (!updatedAt) {
      return latest;
    }
    return !latest || updatedAt > latest ? updatedAt : latest;
  }, null);
}

export function syncJsonRecordTable(
  db: Database,
  tableName: string,
  records: Array<{ id: string; value: string }>,
  updatedAt: string,
): void {
  assertSafeSqlIdentifier(tableName);

  const incomingIds = new Set(records.map((record) => record.id));
  const markDeleted = db.prepare(`UPDATE ${tableName} SET updated_at = ?, deleted_at = ? WHERE deleted_at IS NULL AND id = ?`);
  const existing = db.prepare(`SELECT id FROM ${tableName} WHERE deleted_at IS NULL`).all();
  for (const row of existing) {
    if (row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string' && !incomingIds.has((row as { id: string }).id)) {
      markDeleted.run(updatedAt, updatedAt, (row as { id: string }).id);
    }
  }

  const upsert = db.prepare(
    `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET
       value_json = excluded.value_json,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
  );

  for (const record of records) {
    const { createdAt } = extractJsonRecordTimestamps(record.value);
    upsert.run(record.id, record.value, createdAt, updatedAt);
  }
}
