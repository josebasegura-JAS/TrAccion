/**
 * Adaptador NO productivo del cierre atómico Comité / Paritaria.
 * El controlador futuro debe ceder en exclusiva el handle y conservar
 * el lock SMB distribuido durante la operación y su cierre confirmado.
 */
import type { Database } from 'better-sqlite3';
import type { AtomicSessionWorkflowPayload, AtomicSessionWorkflowResult, DatabaseStatus } from './sqlitePersistence.js';
import { closeSessionWorkflowTransaction } from './persistence/atomicSessionWorkflow.js';

export interface DetachedAtomicSessionClose {
  ownerId: string;
  payload: AtomicSessionWorkflowPayload;
}

/** Validación defensiva previa a cualquier SQL: no acepta tabla arbitraria. */
export function isDetachedAtomicSessionClose(value: unknown): value is DetachedAtomicSessionClose {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (typeof input.ownerId !== 'string' || !input.ownerId.trim() ||
      !input.payload || typeof input.payload !== 'object') return false;
  const payload = input.payload as Record<string, unknown>;
  if (payload.module !== 'comite' && payload.module !== 'paritaria') return false;
  const validRecord = (item: unknown): boolean => {
    if (!item || typeof item !== 'object') return false;
    const rec = item as Record<string, unknown>;
    return typeof rec.id === 'string' && !!rec.id.trim() &&
      typeof rec.value === 'string' && !!rec.value.trim() &&
      (rec.expectedUpdatedAt === null || typeof rec.expectedUpdatedAt === 'string');
  };
  if (!validRecord(payload.session) || !Array.isArray(payload.tasks) ||
      payload.tasks.length > 1000 || !payload.tasks.every(validRecord)) return false;
  const taskIds = new Set((payload.tasks as Array<{id: string}>).map(task => task.id));
  if (taskIds.size !== payload.tasks.length) return false;
  if (payload.acta !== null && payload.acta !== undefined) {
    if (!payload.acta || typeof payload.acta !== 'object') return false;
    const acta = payload.acta as Record<string, unknown>;
    if (typeof acta.id !== 'string' || !acta.id.trim() ||
        typeof acta.value !== 'string' || !acta.value.trim() ||
        typeof acta.sourceSessionId !== 'string' || !acta.sourceSessionId.trim()) return false;
  }
  return true;
}

export function closeDetachedSessionWorkflow(
  db: Database,
  request: DetachedAtomicSessionClose,
): AtomicSessionWorkflowResult {
  if (!isDetachedAtomicSessionClose(request)) {
    throw new Error('Petición de cierre atómico aislado inválida.');
  }
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  return closeSessionWorkflowTransaction(
    db, request.payload, status, request.ownerId,
    (database, updatedAt) => {
      database.prepare(
        `INSERT INTO app_metadata (key, value, updated_at)
         VALUES ('persisted_records_refresh_token', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, updated_at = excluded.updated_at`,
      ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
    },
  );
}
