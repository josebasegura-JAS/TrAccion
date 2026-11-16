import { transactionWithMigrationReset, withMigrationFlagRollback } from './migrationRollbackGuard.js';
import type { Database } from 'better-sqlite3';
import { maybeMigrateJsonArrayRecordsFromPersistedRecord, readActiveJsonRecords } from './jsonRecordRepository.js';
import type {
  ConditionalSqliteComiteSessionRecord,
  SqliteComiteSessionRecord,
} from './sesionesRepository.js';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from '../sqlitePersistence.js';
import { saveTeletrabajoBatchTransaction, saveTeletrabajoSingleTransaction, TeletrabajoBatchSaveError } from './teletrabajoWriteCore.js';

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
        transactionWithMigrationReset(db, () => { teletrabajoMigrationDone = false; }, () => maybeMigrateTeletrabajoFromPersistedRecord(db))();
        return { status: currentStatus, records: readTeletrabajoRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
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
        const result = withMigrationFlagRollback(() => { teletrabajoMigrationDone = false; }, () =>
          saveTeletrabajoSingleTransaction(
            db, record, currentStatus, maybeMigrateTeletrabajoFromPersistedRecord, updateRefreshMetadata,
          ),
        );

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
          const results = withMigrationFlagRollback(() => { teletrabajoMigrationDone = false; }, () =>
            saveTeletrabajoBatchTransaction(
              db, records, currentStatus, maybeMigrateTeletrabajoFromPersistedRecord, updateRefreshMetadata,
            ),
          );

          enqueueLocalBackup('save:teletrabajo_solicitud_records');
          return {
            ok: true,
            status: currentStatus,
            results,
            message: `${records.length} solicitudes de Teletrabajo guardadas en SQLite.`,
          };
        } catch (error) {
          // El callback de migración pudo marcar el flag antes de un rollback.
          // Un fallo del lote invalida la marca; la siguiente carga debe
          // comprobar de nuevo si hay datos legacy pendientes.
          teletrabajoMigrationDone = false;
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
