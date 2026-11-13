/**
 * PR9D-4A: contrato cerrado para la lectura de Tareas desde utilityProcess.
 * Se transportan registros solo al proceso principal, sin escribirlos en logs.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteTaskRecordsFilter, SqliteTaskRecord } from './persistence/taskRepository.js';

export type TaskReadWorkerRequest =
  | { kind: 'tasks:read'; databasePath: string; expected: ExpectedSqliteIdentity; filter: SqliteTaskRecordsFilter }
  | { kind: 'tasks:shutdown' };

export type TaskReadWorkerResponse =
  | { kind: 'tasks:ready' }
  | { kind: 'tasks:result'; records: SqliteTaskRecord[] }
  | { kind: 'tasks:rejected' };

export function isTaskReadWorkerRequest(data: unknown): data is TaskReadWorkerRequest {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.kind === 'tasks:shutdown') return true;
  if (m.kind !== 'tasks:read' || typeof m.databasePath !== 'string' || !m.databasePath.trim()) return false;
  const expected = m.expected as Record<string, unknown> | null;
  if (!expected || typeof expected !== 'object'
      || typeof expected.databaseUuid !== 'string' || !expected.databaseUuid
      || typeof expected.applicationId !== 'string' || !expected.applicationId
      || typeof expected.environment !== 'string' || !expected.environment
      || !Number.isSafeInteger(expected.schemaVersion)) return false;
  if (!m.filter || typeof m.filter !== 'object' || Array.isArray(m.filter)) return false;
  const filter = m.filter as Record<string, unknown>;
  if (Object.keys(filter).some(k => !['mode', 'id', 'ids'].includes(k))) return false;
  if (filter.mode !== undefined && !['all', 'active', 'historical'].includes(String(filter.mode))) return false;
  if (filter.id !== undefined && (typeof filter.id !== 'string' || filter.id.length > 512)) return false;
  if (filter.ids !== undefined &&
      (!Array.isArray(filter.ids) || filter.ids.length > 300
        || !filter.ids.every(id => typeof id === 'string' && id.length <= 512))) return false;
  return !(filter.id !== undefined && filter.ids !== undefined);
}

export function isTaskReadWorkerResponse(data: unknown): data is TaskReadWorkerResponse {
  if (!data || typeof data !== 'object') return false;
  const m = data as Record<string, unknown>;
  if (m.kind === 'tasks:ready' || m.kind === 'tasks:rejected') return true;
  if (m.kind !== 'tasks:result' || !Array.isArray(m.records)) return false;
  return m.records.every((record: unknown) => {
    if (!record || typeof record !== 'object') return false;
    const row = record as Record<string, unknown>;
    return typeof row.id === 'string'
      && typeof row.value === 'string'
      && typeof row.createdAt === 'string'
      && typeof row.updatedAt === 'string'
      && (row.deletedAt === null || typeof row.deletedAt === 'string');
  });
}
