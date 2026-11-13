/**
 * Lectura completa de marcadores de sincronización en SQLite readonly.
 * Se ejecuta dentro de utilityProcess: nunca toca el handle del main.
 */
import type { Database } from 'better-sqlite3';
import { getDirectStoreUpdatedAtSnapshot } from './persistence/directStoreUpdatedAt.js';
import { getSorteosCollectionUpdatedAt } from './persistence/sorteosRepository.js';

export interface IsolatedSyncTokens {
  refreshToken: string | null;
  latestUpdatedAt: string | null;
  taskRecordsUpdatedAt: string | null;
  sorteosDrawsUpdatedAt: string | null;
  sorteosExclusionsUpdatedAt: string | null;
  directStoreUpdatedAt: Record<string, string | null>;
}

function readString(row: unknown, key: 'value' | 'updated_at'): string | null {
  if (!row || typeof row !== 'object') return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

export function readIsolatedSyncTokens(db: Database): IsolatedSyncTokens {
  // Una transacción de lectura proporciona una fotografía coherente incluso
  // cuando otro cliente escribe entre dos consultas SELECT.
  return db.transaction((): IsolatedSyncTokens => ({
    latestUpdatedAt: readString(
      db.prepare('SELECT updated_at FROM persisted_records ORDER BY updated_at DESC LIMIT 1').get(),
      'updated_at',
    ),
    refreshToken: readString(
      db.prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'").get(),
      'value',
    ),
    taskRecordsUpdatedAt: readString(
      db.prepare('SELECT MAX(updated_at) AS updated_at FROM task_records').get(), 'updated_at',
    ),
    sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
    sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
    directStoreUpdatedAt: getDirectStoreUpdatedAtSnapshot(db),
  }))();
}
