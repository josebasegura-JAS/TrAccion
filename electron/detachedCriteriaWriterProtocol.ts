import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { DetachedCriteriaSave, DetachedCriteriaSaveResult } from './detachedCriteriaWriterCore.js';

export type DetachedWriterRequest =
  | { kind: 'detached:open'; databasePath: string; expected: ExpectedSqliteIdentity }
  | { kind: 'detached:save'; operationId: string; record: DetachedCriteriaSave }
  | { kind: 'detached:close' };

export type DetachedWriterResponse =
  | { kind: 'detached:ready' }
  | { kind: 'detached:opened' }
  | { kind: 'detached:saved'; operationId: string; result: DetachedCriteriaSaveResult }
  | { kind: 'detached:closed' }
  | { kind: 'detached:error'; operationId?: string };

export function isDetachedWriterRequest(value: unknown): value is DetachedWriterRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.kind === 'detached:close') return true;
  if (r.kind === 'detached:open') {
    if (typeof r.databasePath !== 'string' || !r.databasePath.trim()) return false;
    const e = r.expected as Record<string, unknown> | null;
    return !!e && typeof e === 'object' && typeof e.databaseUuid === 'string' && !!e.databaseUuid
      && typeof e.applicationId === 'string' && !!e.applicationId
      && typeof e.environment === 'string' && !!e.environment
      && Number.isSafeInteger(e.schemaVersion) && Number(e.schemaVersion) >= 0;
  }
  if (r.kind === 'detached:save') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim()) return false;
    const d = r.record as Record<string, unknown> | null;
    return !!d && typeof d === 'object' && typeof d.id === 'string' && !!d.id.trim()
      && typeof d.value === 'string'
      && (d.expectedUpdatedAt === null || typeof d.expectedUpdatedAt === 'string');
  }
  return false;
}

export function isDetachedWriterResponse(value: unknown): value is DetachedWriterResponse {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (['detached:ready', 'detached:opened', 'detached:closed'].includes(String(r.kind))) return true;
  if (r.kind === 'detached:error') return r.operationId === undefined || typeof r.operationId === 'string';
  if (r.kind !== 'detached:saved' || typeof r.operationId !== 'string') return false;
  const result = r.result as Record<string, unknown> | null;
  return !!result && typeof result === 'object' &&
    ((result.ok === true && typeof result.updatedAt === 'string') ||
      (result.ok === false && result.conflict === true &&
        (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string')));
}
