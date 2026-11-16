import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { DetachedCriteriaSave, DetachedCriteriaSaveResult } from './detachedCriteriaWriterCore.js';
import type { DetachedJsonWrite, DetachedJsonBatchResult } from './detachedJsonWriterCore.js';
import { isIsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import type { DetachedTaskSave } from './detachedTaskWriterCore.js';
import type { DetachedSessionSave } from './detachedSessionWriterCore.js';
import { isDetachedAtomicSessionClose, type DetachedAtomicSessionClose } from './detachedAtomicSessionCloseCore.js';
import { isDetachedSessionHistoryImport, type DetachedSessionHistoryImport } from './detachedSessionHistoryImportCore.js';
import type { ConditionalSqliteTaskSaveResult, AtomicSessionWorkflowResult, AtomicSessionHistoryImportResult } from './sqlitePersistence.js';

export type DetachedWriterRequest =
  | { kind: 'detached:open'; databasePath: string; expected: ExpectedSqliteIdentity }
  | { kind: 'detached:save'; operationId: string; record: DetachedCriteriaSave }
  | { kind: 'detached:save-json-batch'; operationId: string; table: string; records: DetachedJsonWrite[] }
  | { kind: 'detached:save-task'; operationId: string; payload: DetachedTaskSave }
  | { kind: 'detached:save-session'; operationId: string; payload: DetachedSessionSave }
  | { kind: 'detached:close-session-atomically'; operationId: string; payload: DetachedAtomicSessionClose }
  | { kind: 'detached:import-session-history'; operationId: string; payload: DetachedSessionHistoryImport }
  | { kind: 'detached:close' };

export type DetachedWriterResponse =
  | { kind: 'detached:ready' }
  | { kind: 'detached:opened' }
  | { kind: 'detached:saved'; operationId: string; result: DetachedCriteriaSaveResult }
  | { kind: 'detached:json-batch-saved'; operationId: string; result: DetachedJsonBatchResult }
  | { kind: 'detached:task-saved'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:session-saved'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:session-closed-atomically'; operationId: string; result: AtomicSessionWorkflowResult }
  | { kind: 'detached:session-history-imported'; operationId: string; result: AtomicSessionHistoryImportResult }
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
  if (r.kind === 'detached:import-session-history') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() &&
      isDetachedSessionHistoryImport(r.payload);
  }
  if (r.kind === 'detached:close-session-atomically') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() &&
      isDetachedAtomicSessionClose(r.payload);
  }
  if (r.kind === 'detached:save-session') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.payload || typeof r.payload !== 'object') return false;
    const payload = r.payload as Record<string, unknown>;
    if (!['comite', 'paritaria', 'actas'].includes(String(payload.module)) ||
        typeof payload.ownerId !== 'string' || !payload.ownerId.trim() ||
        !payload.record || typeof payload.record !== 'object') return false;
    const record = payload.record as Record<string, unknown>;
    return typeof record.id === 'string' && !!record.id.trim() &&
      typeof record.value === 'string' && !!record.value.trim() &&
      (record.expectedUpdatedAt === null || typeof record.expectedUpdatedAt === 'string');
  }
  if (r.kind === 'detached:save-task') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.payload || typeof r.payload !== 'object') return false;
    const payload = r.payload as Record<string, unknown>;
    if (typeof payload.ownerId !== 'string' || !payload.ownerId.trim() ||
        !payload.record || typeof payload.record !== 'object') return false;
    const record = payload.record as Record<string, unknown>;
    return typeof record.id === 'string' && !!record.id.trim() &&
      typeof record.value === 'string' && !!record.value.trim() &&
      (record.expectedUpdatedAt === null || typeof record.expectedUpdatedAt === 'string');
  }
  if (r.kind === 'detached:save-json-batch') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        typeof r.table !== 'string' || !isIsolatedJsonTable(r.table) ||
        !Array.isArray(r.records) || !r.records.length || r.records.length > 1000) return false;
    return r.records.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string' && !!row.id.trim() &&
        typeof row.value === 'string' && !!row.value.trim() &&
        (row.expectedUpdatedAt === null || typeof row.expectedUpdatedAt === 'string');
    });
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
  if (r.kind === 'detached:session-history-imported') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      Number.isSafeInteger(result.importedSessionCount) && Number(result.importedSessionCount) >= 0 &&
      Number.isSafeInteger(result.createdTaskCount) && Number(result.createdTaskCount) >= 0 &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:session-closed-atomically') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:task-saved' || r.kind === 'detached:session-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:json-batch-saved') {
    if (typeof r.operationId !== 'string' || !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    if (result.ok === true) return Array.isArray(result.results) &&
      result.results.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const v = item as Record<string, unknown>;
        return v.ok === true && typeof v.currentUpdatedAt === 'string';
      });
    return result.ok === false && typeof result.failedRecordId === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string');
  }
  if (r.kind !== 'detached:saved' || typeof r.operationId !== 'string') return false;
  const result = r.result as Record<string, unknown> | null;
  return !!result && typeof result === 'object' &&
    ((result.ok === true && typeof result.updatedAt === 'string') ||
      (result.ok === false && result.conflict === true &&
        (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string')));
}
