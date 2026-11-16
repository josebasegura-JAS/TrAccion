/**
 * Adaptador de escrituras especializadas de Comité, Paritaria y Actas.
 * Utiliza el repositorio PRODUCTIVO y su lógica OCC + migración legacy.
 * No expone una vía de escritura en producción: requiere previamente cesión
 * exclusiva, lock SMB del coordinador y verificación de identidad.
 */
import type { Database } from 'better-sqlite3';
import { createSesionesRepository, type ConditionalSqliteComiteSessionRecord } from './persistence/sesionesRepository.js';
import { isUpdatedAtRow } from './persistence/sqlitePersistenceHelpers.js';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from './sqlitePersistence.js';

export type DetachedSessionModule = 'comite' | 'paritaria' | 'actas';
export interface DetachedSessionSave {
  module: DetachedSessionModule;
  ownerId: string;
  record: ConditionalSqliteComiteSessionRecord;
}

export async function saveDetachedSessionRecord(
  db: Database,
  input: DetachedSessionSave,
): Promise<ConditionalSqliteTaskSaveResult> {
  if (!input || !['comite', 'paritaria', 'actas'].includes(input.module) ||
      typeof input.ownerId !== 'string' || !input.ownerId.trim() ||
      !input.record || typeof input.record.id !== 'string' || !input.record.id.trim() ||
      typeof input.record.value !== 'string' || !input.record.value.trim() ||
      (input.record.expectedUpdatedAt !== null &&
        typeof input.record.expectedUpdatedAt !== 'string')) {
    throw new Error('Petición de sesión aislada inválida.');
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
  const repo = createSesionesRepository({
    safeDatabaseOperation: async operation => operation(),
    getSqliteStatus: () => status,
    requireDatabase: () => db,
    isUpdatedAtRow,
    updateRefreshMetadata: (database, updatedAt) => {
      database.prepare(
        `INSERT INTO app_metadata (key, value, updated_at)
         VALUES ('persisted_records_refresh_token', ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value, updated_at = excluded.updated_at`,
      ).run(`${updatedAt}:${input.ownerId}`, updatedAt);
    },
    // El backup debe ordenarlo el coordinador cuando confirme exit(0).
    enqueueLocalBackup: () => undefined,
    assertDatabaseWritesAllowed: () => undefined,
    isDatabaseWriteBlockedByHeartbeat: () => false,
  });
  switch (input.module) {
    case 'comite': return repo.saveComiteSessionRecordIfUnchanged(input.record);
    case 'paritaria': return repo.saveParitariaSessionRecordIfUnchanged(input.record);
    case 'actas': return repo.saveActaRecordIfUnchanged(input.record);
  }
}
