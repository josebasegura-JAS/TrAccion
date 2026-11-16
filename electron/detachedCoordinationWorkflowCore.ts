/**
 * Cierre y creación atómicos de Coordinación para utilityProcess.
 * Exclusivamente tras cesión de propietario SQLite y lock SMB externo.
 * La lógica SQL se comparte con main, no se duplica.
 */
import type { Database } from 'better-sqlite3';
import type {
  AtomicCoordinationWorkflowPayload,
  AtomicCoordinationTaskCreationPayload,
  AtomicCoordinationWorkflowResult,
  DatabaseStatus,
} from './sqlitePersistence.js';
import {
  closeCoordinationWorkflowTransaction,
  createCoordinationTaskTransaction,
} from './persistence/atomicCoordinationWorkflows.js';

export type DetachedCoordinationOperation = 'close' | 'create-task';
export type DetachedCoordinationWorkflow =
  | { ownerId: string; operation: 'close'; payload: AtomicCoordinationWorkflowPayload }
  | { ownerId: string; operation: 'create-task'; payload: AtomicCoordinationTaskCreationPayload };

function validCoordinationRecord(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.key === 'string' && !!r.key.trim() &&
    typeof r.value === 'string' &&
    typeof r.expectedUpdatedAt === 'string' && !!r.expectedUpdatedAt.trim();
}
function validTask(value: unknown, existing: boolean): boolean {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return typeof r.id === 'string' && !!r.id.trim() &&
    typeof r.value === 'string' &&
    (!existing || (typeof r.expectedUpdatedAt === 'string' && !!r.expectedUpdatedAt.trim()));
}
export function isDetachedCoordinationWorkflow(value: unknown): value is DetachedCoordinationWorkflow {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() ||
      !r.payload || typeof r.payload !== 'object') return false;
  const p = r.payload as Record<string, unknown>;
  if (!validCoordinationRecord(p.meeting) || !validCoordinationRecord(p.index) ||
      (p.meeting as {key:string}).key === (p.index as {key:string}).key) return false;
  if (r.operation === 'close') {
    if (!Array.isArray(p.tasks) || p.tasks.length > 1000 ||
        !p.tasks.every((task: unknown) => validTask(task, true))) return false;
    const ids = (p.tasks as Array<{id:string}>).map(task => task.id);
    return new Set(ids).size === ids.length;
  }
  return r.operation === 'create-task' && validTask(p.task, false);
}

export function executeDetachedCoordinationWorkflow(
  db: Database, request: DetachedCoordinationWorkflow,
): AtomicCoordinationWorkflowResult {
  if (!isDetachedCoordinationWorkflow(request)) {
    throw new Error('Operación aislada de Coordinación inválida.');
  }
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  const updateRefreshMetadata = (database: Database, updatedAt: string): void => {
    database.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('persisted_records_refresh_token', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
  };
  return request.operation === 'close'
    ? closeCoordinationWorkflowTransaction(db, request.payload, status, updateRefreshMetadata)
    : createCoordinationTaskTransaction(db, request.payload, status, updateRefreshMetadata);
}
