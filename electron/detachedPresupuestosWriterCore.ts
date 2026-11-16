/** Adaptador aislado de Presupuestos; nunca invocar sin cesión exclusiva SQLite/SMB. */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { SimpleJsonSaveResult } from './persistence/simpleJsonModuleRepository.js';
import type { PresupuestosSnapshotInput } from './persistence/presupuestosRepository.js';
import { savePresupuestosTransaction } from './persistence/presupuestosWriteCore.js';

export interface DetachedPresupuestosSave {
  ownerId: string;
  snapshot: PresupuestosSnapshotInput;
}

const COLLECTIONS = ['scenarios', 'manualItems', 'ticketGroups', 'actuals'] as const;

export function isDetachedPresupuestosSave(value: unknown): value is DetachedPresupuestosSave {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (typeof payload.ownerId !== 'string' || !payload.ownerId.trim() ||
      !payload.snapshot || typeof payload.snapshot !== 'object' ||
      Array.isArray(payload.snapshot)) return false;
  const snapshot = payload.snapshot as Record<string, unknown>;
  if (snapshot.expectedUpdatedAt !== null && typeof snapshot.expectedUpdatedAt !== 'string') return false;
  for (const key of COLLECTIONS) {
    const records = snapshot[key];
    if (!Array.isArray(records) || records.length > 10000) return false;
    const ids = new Set<string>();
    for (const candidate of records) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
      const record = candidate as Record<string, unknown>;
      if (typeof record.id !== 'string' || !record.id.trim() ||
          typeof record.value !== 'string' || ids.has(record.id)) return false;
      ids.add(record.id);
    }
  }
  return true;
}

/** OCC, cuatro tablas y token en el mismo commit, sin backup desde el child. */
export function saveDetachedPresupuestos(db: Database, request: DetachedPresupuestosSave): SimpleJsonSaveResult {
  if (!isDetachedPresupuestosSave(request)) throw new Error('Petición aislada de Presupuestos inválida.');
  const status: DatabaseStatus = {
    ready: true, engine: 'better-sqlite3', phase: 'active',
    path: ':detached-owner:', schemaVersion: 0,
    isDefaultPath: false, lockPath: ':external-smb-lock:',
  };
  return savePresupuestosTransaction(db, request.snapshot, status, (database, updatedAt) => {
    database.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('persisted_records_refresh_token', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`, updatedAt);
  });
}
