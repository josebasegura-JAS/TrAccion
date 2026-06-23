import type { Database } from 'better-sqlite3';
import {
  extractJsonRecordTimestamps,
  maybeMigrateJsonArrayRecordsFromPersistedRecord,
  readActiveJsonRecords,
} from './jsonRecordRepository.js';

export interface SimpleDatabaseStatus {
  ready: boolean;
  engine: 'better-sqlite3';
  phase: 'prepared' | 'active' | 'fallback' | 'error' | 'locked';
  path: string;
  schemaVersion: number;
  isDefaultPath: boolean;
  lockPath: string;
  message?: string;
}

export interface SimpleJsonRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ConditionalSimpleJsonRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface SimpleJsonRecordsSnapshot {
  status: SimpleDatabaseStatus;
  records: SimpleJsonRecord[];
}

export interface SimpleJsonSaveResult {
  ok: boolean;
  status: SimpleDatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export interface SimpleJsonModuleRepositoryDependencies {
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: SimpleDatabaseStatus, message: string) => T,
  ) => Promise<T>;
  getSqliteStatus: () => SimpleDatabaseStatus;
  requireDatabase: () => Database;
  isUpdatedAtRow: (row: unknown) => row is { updated_at: string };
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export interface SimpleJsonModuleRepositoryOptions {
  tableName: string;
  legacyKey: string;
  moduleLabel: string;
  getMigrationDone: () => boolean;
  setMigrationDone: (value: boolean) => void;
}

function maybeMigrateJsonModuleRecords(
  db: Database,
  options: SimpleJsonModuleRepositoryOptions,
): void {
  options.setMigrationDone(
    maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
      tableName: options.tableName,
      legacyKey: options.legacyKey,
      migrationDone: options.getMigrationDone(),
    }),
  );
}

/**
 * Señal interna para abortar la transacción de saveManyIfUnchanged en el
 * primer registro que falle, llevando adjunto el resultado real para
 * devolverlo al caller (no es un error genérico, es control de flujo).
 */
class BatchSaveError extends Error {
  constructor(
    public readonly recordId: string,
    public readonly saveResult: SimpleJsonSaveResult,
  ) {
    super(saveResult.message);
  }
}

function saveJsonModuleRecordInTransaction(
  db: Database,
  record: ConditionalSimpleJsonRecord,
  currentStatus: SimpleDatabaseStatus,
  options: SimpleJsonModuleRepositoryOptions,
  deps: SimpleJsonModuleRepositoryDependencies,
): SimpleJsonSaveResult {
  const row = db.prepare(`SELECT updated_at FROM ${options.tableName} WHERE id = ?`).get(record.id);
  const currentUpdatedAt = deps.isUpdatedAtRow(row) ? row.updated_at : null;

  if (currentUpdatedAt !== record.expectedUpdatedAt) {
    return {
      ok: false,
      status: currentStatus,
      currentUpdatedAt,
      message: `${options.moduleLabel} ha sido modificado por otro usuario. Recarga antes de guardar.`,
    };
  }

  const { createdAt, updatedAt, deletedAt } = extractJsonRecordTimestamps(record.value);

  if (currentUpdatedAt === null) {
    const insertResult = db
      .prepare(
        `INSERT OR IGNORE INTO ${options.tableName} (id, value_json, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.value, createdAt, updatedAt, deletedAt);

    if (insertResult.changes !== 1) {
      const latest = db.prepare(`SELECT updated_at FROM ${options.tableName} WHERE id = ?`).get(record.id);
      return {
        ok: false,
        status: currentStatus,
        currentUpdatedAt: deps.isUpdatedAtRow(latest) ? latest.updated_at : null,
        message: `${options.moduleLabel} ya existe en la base compartida. Recarga antes de continuar.`,
      };
    }
  } else {
    const updateResult = db
      .prepare(
        `UPDATE ${options.tableName}
         SET value_json = ?, updated_at = ?, deleted_at = ?
         WHERE id = ? AND updated_at = ?`,
      )
      .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

    if (updateResult.changes !== 1) {
      const latest = db.prepare(`SELECT updated_at FROM ${options.tableName} WHERE id = ?`).get(record.id);
      return {
        ok: false,
        status: currentStatus,
        currentUpdatedAt: deps.isUpdatedAtRow(latest) ? latest.updated_at : null,
        message: `${options.moduleLabel} ha sido modificado por otro usuario. Recarga antes de guardar.`,
      };
    }
  }

  deps.updateRefreshMetadata(db, updatedAt);

  return {
    ok: true,
    status: currentStatus,
    currentUpdatedAt: updatedAt,
    message: 'Registro guardado en SQLite.',
  };
}

export interface SimpleJsonBatchSaveResult {
  ok: boolean;
  status: ReturnType<SimpleJsonModuleRepositoryDependencies['getSqliteStatus']>;
  /** Resultado individual de cada registro, en el mismo orden que se recibieron. */
  results: SimpleJsonSaveResult[];
  /** Id del primer registro que falló, si ok es false. */
  failedRecordId?: string;
  message: string;
}

export function createSimpleJsonModuleRepository(
  options: SimpleJsonModuleRepositoryOptions,
  deps: SimpleJsonModuleRepositoryDependencies,
): {
  loadSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
  saveManyIfUnchanged: (records: ConditionalSimpleJsonRecord[]) => Promise<SimpleJsonBatchSaveResult>;
} {
  return {
    loadSnapshot: () => deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = deps.requireDatabase();
        db.transaction(() => maybeMigrateJsonModuleRecords(db, options))();
        return { status: currentStatus, records: readActiveJsonRecords(db, options.tableName) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    ),

    saveIfUnchanged: (record) => deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || deps.isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        deps.assertDatabaseWritesAllowed();

        const db = deps.requireDatabase();
        const result = db.transaction((): SimpleJsonSaveResult => {
          maybeMigrateJsonModuleRecords(db, options);
          const saveResult = saveJsonModuleRecordInTransaction(db, record, currentStatus, options, deps);
          return saveResult.ok ? { ...saveResult, message: `${options.moduleLabel} guardado en SQLite.` } : saveResult;
        })();

        if (result.ok) {
          deps.enqueueLocalBackup(`save:${options.tableName}`);
        }

        return result;
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentUpdatedAt: null,
        message,
      }),
    ),

    /**
     * Guarda varios registros en una sola transacción SQLite. Atómico: si
     * cualquier registro falla (conflicto de concurrencia u otro motivo),
     * ninguno se aplica — better-sqlite3 revierte la transacción completa al
     * lanzar dentro de db.transaction(...). Pensado para importadores
     * masivos, que antes guardaban fila a fila con un await secuencial por
     * registro (N round-trips IPC en vez de 1).
     */
    saveManyIfUnchanged: (records) => deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || deps.isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            results: [],
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        if (records.length === 0) {
          return { ok: true, status: currentStatus, results: [], message: 'Nada que guardar.' };
        }

        deps.assertDatabaseWritesAllowed();

        const db = deps.requireDatabase();
        try {
          const results = db.transaction((): SimpleJsonSaveResult[] => {
            maybeMigrateJsonModuleRecords(db, options);
            return records.map((record) => {
              const saveResult = saveJsonModuleRecordInTransaction(db, record, currentStatus, options, deps);
              if (!saveResult.ok) {
                // Lanzar dentro de db.transaction(...) revierte todo lo
                // aplicado hasta ahora en esta misma llamada — atomicidad
                // real del lote completo, no solo del registro individual.
                throw new BatchSaveError(record.id, saveResult);
              }
              return saveResult;
            });
          })();

          deps.enqueueLocalBackup(`save:${options.tableName}`);
          return {
            ok: true,
            status: currentStatus,
            results,
            message: `${records.length} registros de ${options.moduleLabel} guardados en SQLite.`,
          };
        } catch (error) {
          if (error instanceof BatchSaveError) {
            return {
              ok: false,
              status: currentStatus,
              results: [error.saveResult],
              failedRecordId: error.recordId,
              message: error.saveResult.message,
            };
          }
          throw error;
        }
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        results: [],
        message,
      }),
    ),
  };
}
