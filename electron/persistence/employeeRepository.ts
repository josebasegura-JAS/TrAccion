import type { Database } from 'better-sqlite3';
import type { DatabaseStatus, PersistedStorageRecordSnapshot } from '../sqlitePersistence.js';

export interface SqliteEmployeeRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteEmployeeRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteEmployeeRecord[];
}

export interface ConditionalSqliteEmployeeRecord {
  id: string;
  value: string;
  expectedValue: string | null;
}

export interface ConditionalSqliteEmployeeSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentValue: string | null;
  message: string;
}

export interface ConditionalSqliteEmployeeBatchSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentValue: string | null;
  message: string;
  saved: number;
}

interface EmployeeRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function isEmployeeRecordRow(value: unknown): value is EmployeeRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<EmployeeRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function mapEmployeeRecordRow(row: EmployeeRecordRow): SqliteEmployeeRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function isJsonObjectWithEmpleado(value: unknown): value is { empleado: string; deletedAt?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as { empleado?: unknown };
  return typeof candidate.empleado === 'string' && candidate.empleado.trim().length > 0;
}

function readEmployeeRecords(db: Database): SqliteEmployeeRecord[] {
  return db
    .prepare('SELECT id, value_json, created_at, updated_at, deleted_at FROM employee_records ORDER BY id')
    .all()
    .filter(isEmployeeRecordRow)
    .map(mapEmployeeRecordRow);
}

function readValueJson(row: unknown): string | null {
  return row && typeof row === 'object' && typeof (row as { value_json?: unknown }).value_json === 'string'
    ? (row as { value_json: string }).value_json
    : null;
}

/**
 * Dependencias de orquestación que siguen viviendo en sqlitePersistence.ts
 * (safeDatabaseOperation, guards de fila genéricos, backups, etc.) y se
 * pasan ya construidas, igual que en el resto de repositorios extraídos,
 * para evitar una dependencia circular en tiempo de ejecución.
 */
export interface EmployeeRepositoryDeps {
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: DatabaseStatus, message: string) => T,
  ) => Promise<T>;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  readPersistedRecordByKey: (db: Database, key: string) => PersistedStorageRecordSnapshot | null;
  isCountRow: (value: unknown) => value is { count: number };
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export interface EmployeeRepositoryApi {
  loadEmployeeRecordsSnapshot: () => Promise<SqliteEmployeeRecordsSnapshot>;
  saveEmployeeRecordIfUnchanged: (
    record: ConditionalSqliteEmployeeRecord,
  ) => Promise<ConditionalSqliteEmployeeSaveResult>;
  saveEmployeeRecordsIfUnchanged: (
    records: ConditionalSqliteEmployeeRecord[],
  ) => Promise<ConditionalSqliteEmployeeBatchSaveResult>;
  /** Debe llamarse junto al resto de flags de migración al cerrar/cambiar de base. */
  resetMigrationState: () => void;
}

/**
 * El flag de migración (antes employeesMigrationDone, variable suelta a
 * nivel de módulo en sqlitePersistence.ts) vive ahora en el closure de esta
 * factoría.
 */
export function createEmployeeRepository(deps: EmployeeRepositoryDeps): EmployeeRepositoryApi {
  const {
    safeDatabaseOperation,
    getSqliteStatus,
    requireDatabase,
    readPersistedRecordByKey,
    isCountRow,
    updateRefreshMetadata,
    enqueueLocalBackup,
    assertDatabaseWritesAllowed,
    isDatabaseWriteBlockedByHeartbeat,
  } = deps;

  let employeesMigrationDone = false;

  function maybeMigrateEmployeesFromPersistedRecord(db: Database): void {
    if (employeesMigrationDone) {
      return;
    }

    const employeeCountRow = db.prepare('SELECT COUNT(*) AS count FROM employee_records').get();
    const employeeCount = isCountRow(employeeCountRow) ? employeeCountRow.count : 0;
    if (employeeCount > 0) {
      employeesMigrationDone = true;
      return;
    }

    const legacyRecord = readPersistedRecordByKey(db, 'traccion.v1.plantilla.employees');
    if (!legacyRecord) {
      employeesMigrationDone = true;
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(legacyRecord.value);
    } catch {
      employeesMigrationDone = true;
      return;
    }

    if (!Array.isArray(parsed)) {
      employeesMigrationDone = true;
      return;
    }

    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    );

    for (const item of parsed) {
      if (!isJsonObjectWithEmpleado(item)) {
        continue;
      }

      const deletedAt = typeof item.deletedAt === 'string' ? item.deletedAt : null;
      insert.run(item.empleado, JSON.stringify(item), now, now, deletedAt);
    }

    employeesMigrationDone = true;
  }

  async function loadEmployeeRecordsSnapshot(): Promise<SqliteEmployeeRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateEmployeesFromPersistedRecord(db))();
        return { status: currentStatus, records: readEmployeeRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  async function saveEmployeeRecordIfUnchanged(
    record: ConditionalSqliteEmployeeRecord,
  ): Promise<ConditionalSqliteEmployeeSaveResult> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            currentValue: null,
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        assertDatabaseWritesAllowed();

        const db = requireDatabase();
        const result = db.transaction((): ConditionalSqliteEmployeeSaveResult => {
          maybeMigrateEmployeesFromPersistedRecord(db);
          const row = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
          const currentValue = readValueJson(row);

          if (currentValue !== record.expectedValue) {
            return {
              ok: false,
              status: currentStatus,
              currentValue,
              message:
                'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
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

          if (currentValue === null) {
            const insertResult = db
              .prepare(
                `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(record.id, record.value, now, now, deletedAt);

            if (insertResult.changes !== 1) {
              const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentValue: readValueJson(latest),
                message: 'La persona ya existe en la base compartida. Recarga antes de continuar.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE employee_records
                 SET value_json = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ? AND value_json = ?`,
              )
              .run(record.value, now, deletedAt, record.id, currentValue);

            if (updateResult.changes !== 1) {
              const latest = db.prepare('SELECT value_json FROM employee_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentValue: readValueJson(latest),
                message:
                  'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
              };
            }
          }

          updateRefreshMetadata(db, now);

          return {
            ok: true,
            status: currentStatus,
            currentValue: record.value,
            message: 'Persona guardada en SQLite.',
          };
        })();

        if (result.ok) {
          enqueueLocalBackup('save:employee_records');
        }

        return result;
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentValue: null,
        message,
      }),
    );
  }

  async function saveEmployeeRecordsIfUnchanged(
    records: ConditionalSqliteEmployeeRecord[],
  ): Promise<ConditionalSqliteEmployeeBatchSaveResult> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            currentValue: null,
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
            saved: 0,
          };
        }

        assertDatabaseWritesAllowed();

        const db = requireDatabase();
        const result = db.transaction((): ConditionalSqliteEmployeeBatchSaveResult => {
          maybeMigrateEmployeesFromPersistedRecord(db);
          const selectCurrent = db.prepare('SELECT value_json FROM employee_records WHERE id = ?');
          const insertRecord = db.prepare(
            `INSERT OR IGNORE INTO employee_records (id, value_json, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?)`,
          );
          const updateRecord = db.prepare(
            `UPDATE employee_records
             SET value_json = ?, updated_at = ?, deleted_at = ?
             WHERE id = ? AND value_json = ?`,
          );

          const now = new Date().toISOString();
          let saved = 0;

          for (const record of records) {
            const row = selectCurrent.get(record.id);
            const currentValue = readValueJson(row);

            if (currentValue !== record.expectedValue) {
              return {
                ok: false,
                status: currentStatus,
                currentValue,
                message:
                  'La plantilla ha sido modificada por otro usuario durante la importación. Recarga antes de volver a importar.',
                saved: 0,
              };
            }

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

            if (currentValue === null) {
              const insertResult = insertRecord.run(record.id, record.value, now, now, deletedAt);
              if (insertResult.changes !== 1) {
                const latest = selectCurrent.get(record.id);
                return {
                  ok: false,
                  status: currentStatus,
                  currentValue: readValueJson(latest),
                  message: 'La persona ya existe en la base compartida. Recarga antes de volver a importar.',
                  saved: 0,
                };
              }
            } else {
              const updateResult = updateRecord.run(record.value, now, deletedAt, record.id, currentValue);
              if (updateResult.changes !== 1) {
                const latest = selectCurrent.get(record.id);
                return {
                  ok: false,
                  status: currentStatus,
                  currentValue: readValueJson(latest),
                  message:
                    'La plantilla ha sido modificada por otro usuario durante la importación. Recarga antes de volver a importar.',
                  saved: 0,
                };
              }
            }

            saved += 1;
          }

          updateRefreshMetadata(db, now);

          return {
            ok: true,
            status: currentStatus,
            currentValue: null,
            message: `${saved} personas importadas en SQLite.`,
            saved,
          };
        })();

        if (result.ok && result.saved > 0) {
          enqueueLocalBackup('batch-save:employee_records');
        }

        return result;
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentValue: null,
        message,
        saved: 0,
      }),
    );
  }

  return {
    loadEmployeeRecordsSnapshot,
    saveEmployeeRecordIfUnchanged,
    saveEmployeeRecordsIfUnchanged,
    resetMigrationState: () => {
      employeesMigrationDone = false;
    },
  };
}
