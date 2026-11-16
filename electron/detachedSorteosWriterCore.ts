/** Sorteos + exclusiones, adaptador NO productivo del escritor auxiliar.
 * La migración histórica y los cambios se ejecutan en UNA transacción.
 */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { ConditionalSqliteSorteosSnapshot, ConditionalSqliteSorteosSaveResult } from './persistence/sorteosRepository.js';
import { saveSorteosTransaction, migrateSorteosLegacyInTransaction } from './persistence/sorteosRepository.js';

export interface DetachedSorteosSave {
  ownerId: string;
  snapshot: ConditionalSqliteSorteosSnapshot;
}
export function isDetachedSorteosSave(value: unknown): value is DetachedSorteosSave {
  if (!value || typeof value !== 'object') return false;
  const r=value as Record<string,unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() || !r.snapshot || typeof r.snapshot !== 'object') return false;
  const s=r.snapshot as Record<string,unknown>;
  if ((s.expectedDrawsUpdatedAt !== null && typeof s.expectedDrawsUpdatedAt !== 'string') ||
      (s.expectedExclusionsUpdatedAt !== null && typeof s.expectedExclusionsUpdatedAt !== 'string')) return false;
  for (const key of ['draws','exclusions'] as const) {
    const rows=s[key];
    if (!Array.isArray(rows) || rows.length > 10000) return false;
    const ids=new Set<string>();
    for (const item of rows) {
      if (!item || typeof item !== 'object') return false;
      const rec=item as Record<string,unknown>;
      if (typeof rec.id !== 'string' || !rec.id.trim() || typeof rec.value !== 'string' || ids.has(rec.id)) return false;
      ids.add(rec.id);
    }
  }
  return true;
}
export function saveDetachedSorteos(db: Database, request: DetachedSorteosSave): ConditionalSqliteSorteosSaveResult {
  if (!isDetachedSorteosSave(request)) throw new Error('Guardado aislado de Sorteos inválido.');
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  return saveSorteosTransaction(
    db, request.snapshot, status, migrateSorteosLegacyInTransaction,
    (database, updatedAt) => {
      database.prepare(
        `INSERT INTO app_metadata (key,value,updated_at)
         VALUES ('persisted_records_refresh_token',?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
      ).run(`${updatedAt}:${request.ownerId}`,updatedAt);
    },
  );
}
