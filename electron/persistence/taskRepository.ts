import type { Database } from 'better-sqlite3';
import type {
  ConditionalSqliteTaskSaveResult,
  DatabaseStatus,
  PersistedStorageRecordSnapshot,
} from '../sqlitePersistence.js';

export interface SqliteTaskRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteTaskRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteTaskRecord[];
}

export interface SqliteTaskRecordsFilter {
  mode?: 'all' | 'active' | 'historical';
}

export interface ConditionalSqliteTaskRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

interface TaskRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function isTaskRecordRow(value: unknown): value is TaskRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TaskRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function mapTaskRecordRow(row: TaskRecordRow): SqliteTaskRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readTaskRecords(db: Database, filter: SqliteTaskRecordsFilter = {}): SqliteTaskRecord[] {
  const mode = filter.mode ?? 'all';
  const whereClause =
    mode === 'active'
      ? "WHERE deleted_at IS NULL AND COALESCE(json_extract(value_json, '$.closedAt'), '') = '' AND json_extract(value_json, '$.estado') <> 'cerrada'"
      : mode === 'historical'
        ? "WHERE deleted_at IS NULL AND (COALESCE(json_extract(value_json, '$.closedAt'), '') <> '' OR json_extract(value_json, '$.estado') = 'cerrada')"
        : '';

  return db
    .prepare(
      `SELECT id, value_json, created_at, updated_at, deleted_at FROM task_records ${whereClause} ORDER BY created_at, id`,
    )
    .all()
    .filter(isTaskRecordRow)
    .map(mapTaskRecordRow);
}

/**
 * Dependencias de orquestación que siguen viviendo en sqlitePersistence.ts
 * (safeDatabaseOperation, guards de fila genéricos, backups, etc.) y se
 * pasan ya construidas, igual que en el resto de repositorios extraídos,
 * para evitar una dependencia circular en tiempo de ejecución.
 */
export interface TaskRepositoryDeps {
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: DatabaseStatus, message: string) => T,
  ) => Promise<T>;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  readPersistedRecordByKey: (db: Database, key: string) => PersistedStorageRecordSnapshot | null;
  isJsonObjectWithStringId: (
    value: unknown,
  ) => value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown };
  isCountRow: (value: unknown) => value is { count: number };
  isUpdatedAtRow: (value: unknown) => value is { updated_at: string };
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export interface TaskRepositoryApi {
  loadTaskRecordsSnapshot: (filter?: SqliteTaskRecordsFilter) => Promise<SqliteTaskRecordsSnapshot>;
  saveTaskRecordIfUnchanged: (record: ConditionalSqliteTaskRecord) => Promise<ConditionalSqliteTaskSaveResult>;
  /** Debe llamarse junto al resto de flags de migración al cerrar/cambiar de base. */
  resetMigrationState: () => void;
}

/**
 * El flag de migración (antes tasksMigrationDone, variable suelta a nivel
 * de módulo en sqlitePersistence.ts) vive ahora en el closure de esta
 * factoría.
 */
export function createTaskRepository(deps: TaskRepositoryDeps): TaskRepositoryApi {
  const {
    safeDatabaseOperation,
    getSqliteStatus,
    requireDatabase,
    readPersistedRecordByKey,
    isJsonObjectWithStringId,
    isCountRow,
    isUpdatedAtRow,
    updateRefreshMetadata,
    enqueueLocalBackup,
    assertDatabaseWritesAllowed,
    isDatabaseWriteBlockedByHeartbeat,
  } = deps;

  let tasksMigrationDone = false;

  function maybeMigrateTasksFromPersistedRecord(db: Database): void {
    if (tasksMigrationDone) {
      return;
    }

    const taskCountRow = db.prepare('SELECT COUNT(*) AS count FROM task_records').get();
    const taskCount = isCountRow(taskCountRow) ? taskCountRow.count : 0;
    if (taskCount > 0) {
      tasksMigrationDone = true;
      return;
    }

    const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.tareas.tasks');
    if (!legacyRecord) {
      tasksMigrationDone = true;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(legacyRecord.value);
    } catch {
      tasksMigrationDone = true;
      return;
    }

    if (!Array.isArray(parsed)) {
      tasksMigrationDone = true;
      return;
    }

    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const item of parsed) {
      if (!isJsonObjectWithStringId(item)) {
        continue;
      }

      const createdAt = typeof item.createdAt === 'string' ? item.createdAt : now;
      const updatedAt = typeof item.updatedAt === 'string' ? item.updatedAt : createdAt;
      const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
      insert.run(item.id, JSON.stringify(item), createdAt, updatedAt, deletedAt);
    }

    tasksMigrationDone = true;
  }

  async function loadTaskRecordsSnapshot(
    filter: SqliteTaskRecordsFilter = {},
  ): Promise<SqliteTaskRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateTasksFromPersistedRecord(db))();
        return { status: currentStatus, records: readTaskRecords(db, filter) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  async function saveTaskRecordIfUnchanged(
    record: ConditionalSqliteTaskRecord,
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
          maybeMigrateTasksFromPersistedRecord(db);
          const row = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
          const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt,
              message:
                'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
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
                `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(record.id, record.value, createdAt, updatedAt, deletedAt);

            if (insertResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'La tarea ya existe en la base compartida. Recarga antes de continuar.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE task_records
                 SET value_json = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ? AND updated_at = ?`,
              )
              .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

            if (updateResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM task_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message:
                  'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
              };
            }
          }

          updateRefreshMetadata(db, updatedAt);

          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: updatedAt,
            message: 'Tarea guardada en SQLite.',
          };
        })();

        if (result.ok) {
          enqueueLocalBackup('save:task_records');
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

  return {
    loadTaskRecordsSnapshot,
    saveTaskRecordIfUnchanged,
    resetMigrationState: () => {
      tasksMigrationDone = false;
    },
  };
}
