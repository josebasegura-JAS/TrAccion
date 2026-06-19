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

export function createSimpleJsonModuleRepository(
  options: SimpleJsonModuleRepositoryOptions,
  deps: SimpleJsonModuleRepositoryDependencies,
): {
  loadSnapshot: () => Promise<SimpleJsonRecordsSnapshot>;
  saveIfUnchanged: (record: ConditionalSimpleJsonRecord) => Promise<SimpleJsonSaveResult>;
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
  };
}
