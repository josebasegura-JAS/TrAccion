import { isIsolatedJsonTable, type IsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteJsonRecord } from './persistence/jsonRecordRepository.js';

export type JsonReadRequest =
 | { kind: 'json:read'; databasePath: string; expected: ExpectedSqliteIdentity; table: IsolatedJsonTable }
 | { kind: 'json:shutdown' };
export type JsonReadResponse =
 | { kind: 'json:ready' }
 | { kind: 'json:result'; records: SqliteJsonRecord[] }
 | { kind: 'json:rejected' };

export function isJsonReadRequest(value: unknown): value is JsonReadRequest {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'json:shutdown') return true;
  if (v.kind !== 'json:read' || typeof v.databasePath !== 'string' || !v.databasePath.trim()
      || typeof v.table !== 'string' || !isIsolatedJsonTable(v.table)) return false;
  const id = v.expected as Record<string, unknown> | null;
  return !!id && typeof id === 'object'
    && typeof id.databaseUuid === 'string' && !!id.databaseUuid
    && typeof id.applicationId === 'string' && !!id.applicationId
    && typeof id.environment === 'string' && !!id.environment
    && Number.isSafeInteger(id.schemaVersion) && Number(id.schemaVersion) >= 0;
}

export function isJsonReadResponse(value: unknown): value is JsonReadResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.kind === 'json:ready' || v.kind === 'json:rejected') return true;
  return v.kind === 'json:result' && Array.isArray(v.records) &&
    v.records.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const r = entry as Record<string, unknown>;
      return typeof r.id === 'string' && typeof r.value === 'string'
        && typeof r.createdAt === 'string' && typeof r.updatedAt === 'string'
        && (r.deletedAt === null || typeof r.deletedAt === 'string');
    });
}
