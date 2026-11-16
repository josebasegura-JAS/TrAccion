/**
 * Reutiliza EXACTAMENTE el repositorio productivo de Tareas al ejecutar
 * guardados dentro del propietario aislado de SQLite.
 *
 * El worker debe ser el único propietario del handle y el controlador debe
 * mantener el lock SMB: este adaptador no puede utilizarse como escritor
 * simultáneo con Electron main.
 */
import type { Database } from 'better-sqlite3';
import { createTaskRepository, type ConditionalSqliteTaskRecord } from './persistence/taskRepository.js';
import { findForeignTaskEditingLock } from './persistence/recordLocks.js';
import {
  isCountRow, isJsonObjectWithStringId, isUpdatedAtRow, readPersistedRecordByKey,
} from './persistence/sqlitePersistenceHelpers.js';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from './sqlitePersistence.js';

export interface DetachedTaskSave {
  ownerId: string;
  record: ConditionalSqliteTaskRecord;
}

/**
 * El escritor reutiliza el módulo de tareas, incluida su migración legacy
 * y la comprobación de editing_locks (registro y bloqueo de módulo).
 * No se desdobla la lógica OCC en una implementación divergente.
 */
export async function saveDetachedTaskRecord(
  db: Database,
  input: DetachedTaskSave,
): Promise<ConditionalSqliteTaskSaveResult> {
  if (!input || typeof input.ownerId !== 'string' || !input.ownerId.trim() ||
      !input.record || typeof input.record.id !== 'string' || !input.record.id.trim() ||
      typeof input.record.value !== 'string' || !input.record.value.trim() ||
      (input.record.expectedUpdatedAt !== null &&
       typeof input.record.expectedUpdatedAt !== 'string')) {
    throw new Error('Petición de tarea aislada inválida.');
  }
  const status: DatabaseStatus = {
    ready: true,
    engine: 'better-sqlite3',
    phase: 'active',
    path: ':detached-owner:',
    schemaVersion: 0,
    isDefaultPath: false,
    lockPath: ':external-smb-lock:',
  };
  const repo = createTaskRepository({
    safeDatabaseOperation: async (operation) => operation(),
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    readPersistedRecordByKey,
    isJsonObjectWithStringId,
    isCountRow,
    isUpdatedAtRow,
    updateRefreshMetadata: (database, updatedAt) => {
      database.prepare(
        `INSERT INTO app_metadata (key, value, updated_at)
         VALUES ('persisted_records_refresh_token', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, updated_at = excluded.updated_at`,
      ).run(`${updatedAt}:${input.ownerId}`, updatedAt);
    },
    // El coordinador externo debe programar backup tras confirmar exit(0),
    // nunca desde la transacción del child con un segundo handle.
    enqueueLocalBackup: () => undefined,
    assertDatabaseWritesAllowed: () => undefined,
    isDatabaseWriteBlockedByHeartbeat: () => false,
    findForeignTaskEditingLock: (database, taskId) =>
      findForeignTaskEditingLock(database, taskId, input.ownerId),
  });
  return repo.saveTaskRecordIfUnchanged(input.record);
}
