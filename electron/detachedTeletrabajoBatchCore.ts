/** Guardado masivo aislado de Teletrabajo: sin ruta productiva.
 * Misma transacción OCC que main; migración legacy DENTRO del commit.
 */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from './sqlitePersistence.js';
import type { ConditionalSqliteTeletrabajoRecord, TeletrabajoBatchSaveResult } from './persistence/teletrabajoRepository.js';
import { maybeMigrateJsonArrayRecordsFromPersistedRecord } from './persistence/jsonRecordRepository.js';
import { saveTeletrabajoBatchTransaction, TeletrabajoBatchSaveError } from './persistence/teletrabajoWriteCore.js';

export interface DetachedTeletrabajoBatchSave {
  ownerId: string;
  records: ConditionalSqliteTeletrabajoRecord[];
}
export function isDetachedTeletrabajoBatchSave(value: unknown): value is DetachedTeletrabajoBatchSave {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string,unknown>;
  if (typeof r.ownerId !== 'string' || !r.ownerId.trim() ||
      !Array.isArray(r.records) || r.records.length === 0 || r.records.length > 1000) return false;
  const ids = new Set<string>();
  for (const item of r.records) {
    if (!item || typeof item !== 'object') return false;
    const v=item as Record<string,unknown>;
    if (typeof v.id !== 'string' || !v.id.trim() || ids.has(v.id) ||
        typeof v.value !== 'string' || !v.value.trim() ||
        (v.expectedUpdatedAt !== null && typeof v.expectedUpdatedAt !== 'string')) return false;
    ids.add(v.id);
  }
  return true;
}
export function saveDetachedTeletrabajoBatch(
  db: Database, request: DetachedTeletrabajoBatchSave,
): TeletrabajoBatchSaveResult {
  if (!isDetachedTeletrabajoBatchSave(request)) throw new Error('Lote aislado de Teletrabajo inválido.');
  const status: DatabaseStatus = {ready:true,engine:'better-sqlite3',phase:'active',
    path:':detached-owner:',schemaVersion:0,isDefaultPath:false,lockPath:':external-smb-lock:'};
  const migrate = (database: Database) => {
    maybeMigrateJsonArrayRecordsFromPersistedRecord(database, {
      tableName:'teletrabajo_solicitud_records',
      legacyKey:'traccion.v1.teletrabajo.solicitudes',
      migrationDone:false,
    });
  };
  const updateToken = (database: Database, updatedAt:string) => {
    database.prepare(
      `INSERT INTO app_metadata (key,value,updated_at)
       VALUES ('persisted_records_refresh_token',?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
    ).run(`${updatedAt}:${request.ownerId}`,updatedAt);
  };
  try {
    const results=saveTeletrabajoBatchTransaction(db,request.records,status,migrate,updateToken);
    return {ok:true,status,results,message:`${results.length} solicitudes de Teletrabajo guardadas en SQLite.`};
  } catch(error) {
    if (error instanceof TeletrabajoBatchSaveError) {
      return {ok:false,status,results:[error.saveResult],failedRecordId:error.recordId,message:error.saveResult.message};
    }
    throw error;
  }
}
