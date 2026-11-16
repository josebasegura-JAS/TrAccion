import type { Database } from 'better-sqlite3';
import {
  CONFIGURACION_STATE_ID,
  isConfiguracionStateRow,
} from './schemaMigrations.js';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import { saveConfiguracionTransaction } from './configuracionWriteCore.js';

export interface ConfiguracionSnapshot {
  status: DatabaseStatus;
  value: string | null;
  updatedAt: string | null;
}

export interface ConditionalConfiguracionRecord {
  value: string;
  expectedUpdatedAt: string | null;
}

export interface ConfiguracionSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

export interface ConfiguracionRepositoryDependencies {
  safeDatabaseOperation: <T>(
    operation: () => T,
    fallback: (status: DatabaseStatus, message: string) => T,
  ) => Promise<T>;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  isUpdatedAtRow: (row: unknown) => row is { updated_at: string };
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export function createConfiguracionRepository(deps: ConfiguracionRepositoryDependencies) {
  let migrationDone = false;

  function maybeMigrateFromPersistedRecord(db: Database): void {
    if (migrationDone) {
      return;
    }

    const row = db
      .prepare('SELECT value_json, updated_at FROM persisted_records WHERE key = ?')
      .get('traccion.v1.configuracion');
    if (!isConfiguracionStateRow(row)) {
      migrationDone = true;
      return;
    }

    const now = row.updated_at || new Date().toISOString();
    db.prepare(
      `INSERT OR IGNORE INTO configuracion_state (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, NULL)`,
    ).run(CONFIGURACION_STATE_ID, row.value_json, now, now);
    migrationDone = true;
  }

  async function loadConfiguracionSnapshot(): Promise<ConfiguracionSnapshot> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, value: null, updatedAt: null };
        }

        const db = deps.requireDatabase();
        db.transaction(() => maybeMigrateFromPersistedRecord(db))();
        const row = db
          .prepare(
            'SELECT value_json, updated_at FROM configuracion_state WHERE id = ? AND deleted_at IS NULL',
          )
          .get(CONFIGURACION_STATE_ID);
        if (!isConfiguracionStateRow(row)) {
          return { status: currentStatus, value: null, updatedAt: null };
        }
        return { status: currentStatus, value: row.value_json, updatedAt: row.updated_at };
      },
      (nextStatus) => ({ status: nextStatus, value: null, updatedAt: null }),
    );
  }

  async function saveConfiguracionIfUnchanged(
    record: ConditionalConfiguracionRecord,
  ): Promise<ConfiguracionSaveResult> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (
          !currentStatus.ready ||
          currentStatus.phase !== 'active' ||
          deps.isDatabaseWriteBlockedByHeartbeat()
        ) {
          return {
            ok: false,
            status: currentStatus,
            currentUpdatedAt: null,
            message:
              currentStatus.message ??
              'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        deps.assertDatabaseWritesAllowed();
        const db = deps.requireDatabase();
        const result = saveConfiguracionTransaction(db, record, currentStatus, deps.updateRefreshMetadata);
        if (result.ok) deps.enqueueLocalBackup('save:configuracion');
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
    loadConfiguracionSnapshot,
    saveConfiguracionIfUnchanged,
  };
}
