/**
 * Adaptador histórico Comité / Paritaria, no productivo.
 * Requiere cesión confirmada, identidad SQLite y lock SMB EXTERNO.
 */
import type { Database } from 'better-sqlite3';
import type { AtomicSessionHistoryImportPayload, AtomicSessionHistoryImportResult, DatabaseStatus } from './sqlitePersistence.js';
import { importSessionHistoryTransaction } from './persistence/atomicSessionHistoryImport.js';

export interface DetachedSessionHistoryImport {
  ownerId: string;
  payload: AtomicSessionHistoryImportPayload;
}
const validHistoryRow = (item: unknown, session: boolean): boolean => {
  if (!item || typeof item !== 'object') return false;
  const r = item as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id.trim() ||
      typeof r.externalKey !== 'string' || !r.externalKey.trim() ||
      typeof r.value !== 'string' || !r.value.trim()) return false;
  return !session || (Array.isArray(r.taskExternalKeys) && r.taskExternalKeys.length <= 1000 &&
    r.taskExternalKeys.every((k: unknown) => typeof k === 'string' && !!k.trim()));
};

/** No SQL arbitrario, tamaños limitados, no aceptar strings/objetos malformados. */
export function isDetachedSessionHistoryImport(value: unknown): value is DetachedSessionHistoryImport {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() ||
      !r.payload || typeof r.payload !== 'object') return false;
  const p = r.payload as Record<string, unknown>;
  if (p.module !== 'comite' && p.module !== 'paritaria') return false;
  if (!Array.isArray(p.tasks) || !Array.isArray(p.sessions) ||
      p.tasks.length > 1000 || p.sessions.length > 1000 ||
      !p.tasks.every((item: unknown) => validHistoryRow(item, false)) ||
      !p.sessions.every((item: unknown) => validHistoryRow(item, true))) return false;
  // Una clave externa duplicada en tareas causa resultados ambiguos en el mapa.
  const taskKeys = (p.tasks as Array<{externalKey:string}>).map(x => x.externalKey);
  if (new Set(taskKeys).size !== taskKeys.length) return false;
  return true;
}

export function importDetachedSessionHistory(
  db: Database, request: DetachedSessionHistoryImport,
): AtomicSessionHistoryImportResult {
  if (!isDetachedSessionHistoryImport(request)) {
    throw new Error('Solicitud histórica aislada inválida.');
  }
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  // El backup lo agenda el coordinador exclusivamente tras confirmar exit(0).
  return importSessionHistoryTransaction(db, request.payload, status, (database, updatedAt) => {
    database.prepare(
      `INSERT INTO app_metadata (key,value,updated_at)
       VALUES ('persisted_records_refresh_token',?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
  });
}
