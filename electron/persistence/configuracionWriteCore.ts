/** Escritura OCC de Configuración, reutilizable desde main y utilityProcess.
 * El llamador es responsable de la propiedad exclusiva SQLite y del lock SMB.
 */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import type { ConditionalConfiguracionRecord, ConfiguracionSaveResult } from './configuracionRepository.js';
import { CONFIGURACION_STATE_ID, isConfiguracionStateRow } from './schemaMigrations.js';
import { isUpdatedAtRow } from './sqlitePersistenceHelpers.js';

/** Migración idempotente que debe suceder dentro de la transacción de escritura. */
export function migrateConfiguracionStateInTransaction(db: Database): void {
  const old = db.prepare('SELECT value_json, updated_at FROM persisted_records WHERE key = ?')
    .get('traccion.v1.configuracion');
  if (!isConfiguracionStateRow(old)) return;
  const now = old.updated_at || new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO configuracion_state (id,value_json,created_at,updated_at,deleted_at)
     VALUES (?,?,?,?,NULL)`,
  ).run(CONFIGURACION_STATE_ID, old.value_json, now, now);
}

export function saveConfiguracionTransaction(
  db: Database,
  record: ConditionalConfiguracionRecord,
  status: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): ConfiguracionSaveResult {
  if (!record || typeof record.value !== 'string' ||
      (record.expectedUpdatedAt !== null && typeof record.expectedUpdatedAt !== 'string')) {
    throw new Error('Registro de Configuración inválido.');
  }
  return db.transaction((): ConfiguracionSaveResult => {
    migrateConfiguracionStateInTransaction(db);
    const row = db.prepare('SELECT updated_at FROM configuracion_state WHERE id = ?')
      .get(CONFIGURACION_STATE_ID);
    const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;
    if (currentUpdatedAt !== record.expectedUpdatedAt) {
      return {
        ok: false, status, currentUpdatedAt,
        message: 'Configuración ha sido modificada por otro usuario. Recarga antes de guardar.',
      };
    }

    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO configuracion_state (id,value_json,created_at,updated_at,deleted_at)
       VALUES (?,?,?,?,NULL)
       ON CONFLICT(id) DO UPDATE SET
         value_json=excluded.value_json, updated_at=excluded.updated_at, deleted_at=NULL`,
    ).run(CONFIGURACION_STATE_ID, record.value, updatedAt, updatedAt);
    updateRefreshMetadata(db, updatedAt);
    return {
      ok: true, status, currentUpdatedAt: updatedAt,
      message: 'Configuración guardada en SQLite.',
    };
  })();
}
