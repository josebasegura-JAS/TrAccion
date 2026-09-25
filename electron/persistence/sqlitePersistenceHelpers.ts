import type { Database } from 'better-sqlite3';

export interface PersistedRecordSnapshotLike {
  key: string;
  value: string;
  updatedAt: string;
}

interface PersistedRecordRow {
  key: string;
  value_json: string;
  updated_at: string;
}

interface MetadataRow {
  value: string;
}

interface UpdatedAtRow {
  updated_at: string;
}

interface CountRow {
  count: number;
}

export function logSqliteMetric(message: string, data?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  if (data) {
    console.info(`[sqlite] ${message}`, data);
    return;
  }

  console.info(`[sqlite] ${message}`);
}

export function largestPersistedRecordSizes(
  records: PersistedRecordSnapshotLike[],
): Array<{ key: string; bytes: number }> {
  return records
    .map((record) => ({ key: record.key, bytes: Buffer.byteLength(record.value, 'utf8') }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 10);
}

export function isPersistedRecordRow(value: unknown): value is PersistedRecordRow {
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

export function isCountRow(value: unknown): value is CountRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CountRow>;
  return typeof candidate.count === 'number';
}

export function isJsonObjectWithStringId(
  value: unknown,
): value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { id?: unknown };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0;
}

export function isMetadataRow(value: unknown): value is MetadataRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MetadataRow>;
  return typeof candidate.value === 'string';
}

export function isUpdatedAtRow(value: unknown): value is UpdatedAtRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<UpdatedAtRow>;
  return typeof candidate.updated_at === 'string';
}

export function readPersistedRecordByKey(
  db: Database,
  key: string,
): PersistedRecordSnapshotLike | null {
  const row = db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records WHERE key = ?')
    .get(key);

  return isPersistedRecordRow(row)
    ? { key: row.key, value: row.value_json, updatedAt: row.updated_at }
    : null;
}

export function readAllPersistedRecords(db: Database): PersistedRecordSnapshotLike[] {
  return db
    .prepare('SELECT key, value_json, updated_at FROM persisted_records ORDER BY key')
    .all()
    .filter(isPersistedRecordRow)
    .map((row) => ({
      key: row.key,
      value: row.value_json,
      updatedAt: row.updated_at,
    }));
}
