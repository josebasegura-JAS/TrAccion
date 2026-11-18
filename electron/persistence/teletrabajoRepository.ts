import type { Database } from 'better-sqlite3';
import { maybeMigrateJsonArrayRecordsFromPersistedRecord, readActiveJsonRecords } from './jsonRecordRepository.js';
import type {
  ConditionalSqliteComiteSessionRecord,
  SqliteComiteSessionRecord,
} from './sesionesRepository.js';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from '../sqlitePersistence.js';

/**
 * Teletrabajo reutiliza exactamente la misma forma de registro que
 * Comité/Paritaria/Actas (id/value/expectedUpdatedAt), de ahí que siga
 * apoyándose en esos tipos base en vez de redefinirlos.
 */
export type SqliteTeletrabajoRecord = SqliteComiteSessionRecord;

export interface SqliteTeletrabajoRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteTeletrabajoRecord[];
}

export type ConditionalSqliteTeletrabajoRecord = ConditionalSqliteComiteSessionRecord;

export interface TeletrabajoBatchSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  results: ConditionalSqliteTaskSaveResult[];
  failedRecordId?: string;
  message: string;
}

/**
 * Dependencias de orquestación que siguen viviendo en sqlitePersistence.ts
 * (safeDatabaseOperation, guards de fila genéricos, backups, etc.) y se
 * pasan ya construidas, igual que en el resto de repositorios extraídos,
 * para evitar una dependencia circular en tiempo de ejecución.
 */
export interface TeletrabajoRepositoryDeps {
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: DatabaseStatus, message: string) => T,
  ) => Promise<T>;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  isUpdatedAtRow: (value: unknown) => value is { updated_at: string };
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export interface TeletrabajoRepositoryApi {
  loadTeletrabajoRecordsSnapshot: () => Promise<SqliteTeletrabajoRecordsSnapshot>;
  saveTeletrabajoRecordIfUnchanged: (
    record: ConditionalSqliteTeletrabajoRecord,
  ) => Promise<ConditionalSqliteTaskSaveResult>;
  saveTeletrabajoRecordsIfUnchanged: (
    records: ConditionalSqliteTeletrabajoRecord[],
  ) => Promise<TeletrabajoBatchSaveResult>;
  /** Debe llamarse junto al resto de flags de migración al cerrar/cambiar de base. */
  resetMigrationState: () => void;
}

/**
 * El flag de migración (antes teletrabajoMigrationDone, variable suelta a
 * nivel de módulo en sqlitePersistence.ts) vive ahora en el closure de esta
 * factoría.
 */
export function createTeletrabajoRepository(deps: TeletrabajoRepositoryDeps): TeletrabajoRepositoryApi {
  const {
    safeDatabaseOperation,
    getSqliteStatus,
    requireDatabase,
    isUpdatedAtRow,
    updateRefreshMetadata,
    enqueueLocalBackup,
    assertDatabaseWritesAllowed,
    isDatabaseWriteBlockedByHeartbeat,
  } = deps;

  let teletrabajoMigrationDone = false;

  function readTeletrabajoRecords(db: Database): SqliteTeletrabajoRecord[] {
    return readActiveJsonRecords(db, 'teletrabajo_solicitud_records');
  }

  function maybeMigrateTeletrabajoFromPersistedRecord(db: Database): void {
    teletrabajoMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
      tableName: 'teletrabajo_solicitud_records',
      legacyKey: 'traccion.v1.teletrabajo.solicitudes',
      migrationDone: teletrabajoMigrationDone,
    });
  }

  async function loadTeletrabajoRecordsSnapshot(): Promise<SqliteTeletrabajoRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateTeletrabajoFromPersistedRecord(db))();
        return { status: currentStatus, records: readTeletrabajoRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  function saveTeletrabajoRecordInTransaction(
    db: Database,
    record: ConditionalSqliteTeletrabajoRecord,
    currentStatus: DatabaseStatus,
  ): ConditionalSqliteTaskSaveResult {
    const row = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
    const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

    if (currentUpdatedAt !== record.expectedUpdatedAt) {
      return {
        ok: false,
        status: currentStatus,
        currentUpdatedAt,
        message: 'La solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
      };
    }

    const now = new Date().toISOString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.value);
    } catch {
      parsed = null;
    }
    const deletedAt =
      parsed && typeof parsed === 'object' && typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string'
        ? (parsed as { deletedAt: string }).deletedAt
        : null;
    const createdAt =
      parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
        ? (parsed as { createdAt: string }).createdAt
        : now;
    const updatedAt =
      parsed && typeof parsed === 'object' && typeof (parsed as { updatedAt?: unknown }).updatedAt === 'string'
        ? (parsed as { updatedAt: string }).updatedAt
        : now;

    if (currentUpdatedAt === null) {
      const insertResult = db
        .prepare(
          `INSERT OR IGNORE INTO teletrabajo_solicitud_records (id, value_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(record.id, record.value, createdAt, updatedAt, deletedAt);

      if (insertResult.changes !== 1) {
        const latest = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
          message: 'La solicitud ya existe en la base compartida. Recarga antes de continuar.',
        };
      }
    } else {
      const updateResult = db
        .prepare(
          `UPDATE teletrabajo_solicitud_records
           SET value_json = ?, updated_at = ?, deleted_at = ?
           WHERE id = ? AND updated_at = ?`,
        )
        .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

      if (updateResult.changes !== 1) {
        const latest = db.prepare('SELECT updated_at FROM teletrabajo_solicitud_records WHERE id = ?').get(record.id);
        return {
          ok: false,
          status: currentStatus,
          currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
          message: 'La solicitud ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
        };
      }
    }

    updateRefreshMetadata(db, updatedAt);

    return {
      ok: true,
      status: currentStatus,
      currentUpdatedAt: updatedAt,
      message: 'Solicitud de Teletrabajo guardada en SQLite.',
    };
  }

  class TeletrabajoBatchSaveError extends Error {
    constructor(
      public readonly recordId: string,
      public readonly saveResult: ConditionalSqliteTaskSaveResult,
    ) {
      super(saveResult.message);
    }
  }

  async function saveTeletrabajoRecordIfUnchanged(
    record: ConditionalSqliteTeletrabajoRecord,
  ): Promise<ConditionalSqliteTaskSaveResult> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        assertDatabaseWritesAllowed();

        const db = requireDatabase();
        const result = db.transaction((): ConditionalSqliteTaskSaveResult => {
          maybeMigrateTeletrabajoFromPersistedRecord(db);
          return saveTeletrabajoRecordInTransaction(db, record, currentStatus);
        })();

        if (result.ok) {
          enqueueLocalBackup('save:teletrabajo_solicitud_records');
        }

        return result;
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentUpdatedAt: null,
        message,
      }),
    );
  }

  /**
   * Guarda varias solicitudes de Teletrabajo en una sola transacción SQLite.
   * Atómico: si cualquier registro falla (conflicto de concurrencia u otro
   * motivo), ninguno se aplica. Pensado para la confirmación de importación
   * de histórico, que antes guardaba fila a fila con un await secuencial por
   * registro (N round-trips IPC en vez de 1).
   */
  async function saveTeletrabajoRecordsIfUnchanged(
    records: ConditionalSqliteTeletrabajoRecord[],
  ): Promise<TeletrabajoBatchSaveResult> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
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

        assertDatabaseWritesAllowed();

        const db = requireDatabase();
        try {
          const results = db.transaction((): ConditionalSqliteTaskSaveResult[] => {
            maybeMigrateTeletrabajoFromPersistedRecord(db);
            return records.map((record) => {
              const saveResult = saveTeletrabajoRecordInTransaction(db, record, currentStatus);
              if (!saveResult.ok) {
                throw new TeletrabajoBatchSaveError(record.id, saveResult);
              }
              return saveResult;
            });
          })();

          enqueueLocalBackup('save:teletrabajo_solicitud_records');
          return {
            ok: true,
            status: currentStatus,
            results,
            message: `${records.length} solicitudes de Teletrabajo guardadas en SQLite.`,
          };
        } catch (error) {
          if (error instanceof TeletrabajoBatchSaveError) {
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
    );
  }

  return {
    loadTeletrabajoRecordsSnapshot,
    saveTeletrabajoRecordIfUnchanged,
    saveTeletrabajoRecordsIfUnchanged,
    resetMigrationState: () => {
      teletrabajoMigrationDone = false;
    },
  };
}
