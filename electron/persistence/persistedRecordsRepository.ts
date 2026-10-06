import type { Database } from 'better-sqlite3';
import { pruneLocalStorageBackups } from './maintenanceQueries.js';
import { getDirectStoreUpdatedAtSnapshot } from './directStoreUpdatedAt.js';
import { getSorteosCollectionUpdatedAt } from './sorteosRepository.js';
import {
  isMetadataRow,
  isUpdatedAtRow,
  largestPersistedRecordSizes,
  logSqliteMetric,
  readAllPersistedRecords,
  readPersistedRecordByKey,
} from './sqlitePersistenceHelpers.js';
import type { DatabaseStatus } from '../sqlitePersistence.js';

export interface PersistedStorageRecord {
  key: string;
  value: string;
}

export interface ConditionalPersistedStorageRecord extends PersistedStorageRecord {
  expectedUpdatedAt: string | null;
}

export interface PersistedStorageRecordSnapshot extends PersistedStorageRecord {
  updatedAt: string;
}

export interface PersistedRecordsTokenSnapshot {
  status: DatabaseStatus;
  refreshToken: string | null;
  latestUpdatedAt: string | null;
  taskRecordsUpdatedAt: string | null;
  sorteosDrawsUpdatedAt: string | null;
  sorteosExclusionsUpdatedAt: string | null;
  directStoreUpdatedAt: Record<string, string | null>;
}

export interface PersistedRecordsSnapshot extends PersistedRecordsTokenSnapshot {
  records: PersistedStorageRecordSnapshot[];
}

export interface PersistedRecordSnapshot {
  status: DatabaseStatus;
  record: PersistedStorageRecordSnapshot | null;
}

export interface LocalStorageBackupPayload {
  records: PersistedStorageRecord[];
}

export interface ConditionalPersistedRecordSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentUpdatedAt: string | null;
  message: string;
}

type SafeDatabaseOperation = <T>(
  operation: () => T,
  fallback: (status: DatabaseStatus, message: string) => T,
) => Promise<T>;

export interface PersistedRecordsRepositoryDependencies {
  ownerId: () => string;
  getSqliteStatus: () => DatabaseStatus;
  requireDatabase: () => Database;
  safeDatabaseOperation: SafeDatabaseOperation;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
  assertDatabaseWritesAllowed: () => void;
  withDatabaseOperationLock: <T>(databasePath: string, operation: () => Promise<T>) => Promise<T>;
  enqueueLocalBackup: (reason: string) => void;
  getTaskRecordsUpdatedAt: (db: Database) => string | null;
}

function emptyTokenSnapshot(status: DatabaseStatus): PersistedRecordsTokenSnapshot {
  return {
    status,
    refreshToken: null,
    latestUpdatedAt: null,
    taskRecordsUpdatedAt: null,
    sorteosDrawsUpdatedAt: null,
    sorteosExclusionsUpdatedAt: null,
    directStoreUpdatedAt: {},
  };
}

function latestUpdatedAtFromRecords(records: PersistedStorageRecordSnapshot[]): string | null {
  return records.reduce<string | null>((latest, record) => {
    if (!latest) return record.updatedAt;
    return Date.parse(record.updatedAt) > Date.parse(latest) ? record.updatedAt : latest;
  }, null);
}

export function createPersistedRecordsRepository(deps: PersistedRecordsRepositoryDependencies) {
  function updateRefreshMetadata(db: Database, updatedAt: string): void {
    const token = `${updatedAt}:${deps.ownerId()}`;
    db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('persisted_records_refresh_token', ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(token, updatedAt);
  }

  function readRefreshToken(db: Database): string | null {
    const row = db
      .prepare("SELECT value FROM app_metadata WHERE key = 'persisted_records_refresh_token'")
      .get();
    return isMetadataRow(row) ? row.value : null;
  }

  async function savePersistedRecord(record: PersistedStorageRecord): Promise<DatabaseStatus> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (
          !currentStatus.ready ||
          currentStatus.phase === 'locked' ||
          deps.isDatabaseWriteBlockedByHeartbeat()
        ) {
          return currentStatus;
        }

        deps.assertDatabaseWritesAllowed();
        const now = new Date().toISOString();
        const db = deps.requireDatabase();
        db.transaction(() => {
          db.prepare(
            `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
             VALUES (?, ?, 'sqlite-primary', ?, ?)
             ON CONFLICT(key) DO UPDATE SET
               value_json = excluded.value_json,
               source = excluded.source,
               updated_at = excluded.updated_at`,
          ).run(record.key, record.value, now, now);
          updateRefreshMetadata(db, now);
        })();
        deps.enqueueLocalBackup(`save:${record.key}`);
        return currentStatus;
      },
      (nextStatus) => nextStatus,
    );
  }

  async function savePersistedRecordIfUnchanged(
    record: ConditionalPersistedStorageRecord,
  ): Promise<ConditionalPersistedRecordSaveResult> {
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
        const result = db.transaction((): ConditionalPersistedRecordSaveResult => {
          const row = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(record.key);
          const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt,
              message:
                'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
            };
          }

          const now = new Date().toISOString();
          if (currentUpdatedAt === null) {
            const insertResult = db
              .prepare(
                `INSERT OR IGNORE INTO persisted_records (key, value_json, source, created_at, updated_at)
                 VALUES (?, ?, 'sqlite-primary', ?, ?)`,
              )
              .run(record.key, record.value, now, now);

            if (insertResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(record.key);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message:
                  'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE persisted_records
                 SET value_json = ?, source = 'sqlite-primary', updated_at = ?
                 WHERE key = ? AND updated_at = ?`,
              )
              .run(record.value, now, record.key, currentUpdatedAt);

            if (updateResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(record.key);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message:
                  'Los datos compartidos han cambiado mientras guardabas. Recarga antes de continuar para no pisar cambios de otro usuario.',
              };
            }
          }

          updateRefreshMetadata(db, now);
          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: now,
            message: 'Guardado confirmado en SQLite compartido.',
          };
        })();

        if (result.ok) deps.enqueueLocalBackup(`save:${record.key}`);
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

  async function migrateLocalStorageSnapshot(payload: LocalStorageBackupPayload): Promise<DatabaseStatus> {
    const currentStatus = deps.getSqliteStatus();
    if (
      !currentStatus.ready ||
      currentStatus.phase === 'locked' ||
      deps.isDatabaseWriteBlockedByHeartbeat()
    ) {
      return currentStatus;
    }

    deps.assertDatabaseWritesAllowed();
    return deps.withDatabaseOperationLock(currentStatus.path, async () => {
      const db = deps.requireDatabase();
      const now = new Date().toISOString();
      const records = payload.records.filter(
        (record): record is PersistedStorageRecord =>
          typeof record.key === 'string' && typeof record.value === 'string',
      );

      const migrateSnapshotTransaction = db.transaction(() => {
        db.prepare('INSERT INTO local_storage_backups (created_at, payload_json) VALUES (?, ?)').run(
          now,
          JSON.stringify({ records }),
        );
        pruneLocalStorageBackups(db);

        const upsert = db.prepare(
          `INSERT INTO persisted_records (key, value_json, source, created_at, updated_at)
           VALUES (?, ?, 'sqlite-primary', ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value_json = excluded.value_json,
             source = excluded.source,
             updated_at = excluded.updated_at`,
        );
        for (const record of records) upsert.run(record.key, record.value, now, now);
        if (records.length > 0) updateRefreshMetadata(db, now);
      });

      migrateSnapshotTransaction();
      if (records.length > 0) deps.enqueueLocalBackup('migrate-local-storage-snapshot');
      return currentStatus;
    });
  }

  async function getPersistedRecordSnapshot(key: string): Promise<PersistedRecordSnapshot> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase === 'locked') {
          return { status: currentStatus, record: null };
        }
        return {
          status: currentStatus,
          record: readPersistedRecordByKey(deps.requireDatabase(), key),
        };
      },
      (nextStatus) => ({ status: nextStatus, record: null }),
    );
  }

  async function loadPersistedRecordsHydrationSnapshot(): Promise<PersistedRecordsSnapshot> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase === 'locked') {
          return { ...emptyTokenSnapshot(currentStatus), records: [] };
        }

        const db = deps.requireDatabase();
        const startedAt = Date.now();
        const records = readAllPersistedRecords(db);
        const latestUpdatedAt = latestUpdatedAtFromRecords(records);
        logSqliteMetric('loadPersistedRecordsHydrationSnapshot', {
          records: records.length,
          elapsedMs: Date.now() - startedAt,
          largestKeys: largestPersistedRecordSizes(records),
        });
        return {
          status: currentStatus,
          records,
          refreshToken: readRefreshToken(db),
          latestUpdatedAt,
          taskRecordsUpdatedAt: null,
          sorteosDrawsUpdatedAt: null,
          sorteosExclusionsUpdatedAt: null,
          directStoreUpdatedAt: {},
        };
      },
      (nextStatus) => ({ ...emptyTokenSnapshot(nextStatus), records: [] }),
    );
  }

  async function loadPersistedRecordsSnapshot(): Promise<PersistedRecordsSnapshot> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase === 'locked') {
          return { ...emptyTokenSnapshot(currentStatus), records: [] };
        }

        const db = deps.requireDatabase();
        const startedAt = Date.now();
        const records = readAllPersistedRecords(db);
        const latestUpdatedAt = latestUpdatedAtFromRecords(records);
        logSqliteMetric('loadPersistedRecordsSnapshot', {
          records: records.length,
          elapsedMs: Date.now() - startedAt,
          largestKeys: largestPersistedRecordSizes(records),
        });
        return {
          status: currentStatus,
          records,
          refreshToken: readRefreshToken(db),
          latestUpdatedAt,
          taskRecordsUpdatedAt: deps.getTaskRecordsUpdatedAt(db),
          sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
          sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
          directStoreUpdatedAt: getDirectStoreUpdatedAtSnapshot(db),
        };
      },
      (nextStatus) => ({ ...emptyTokenSnapshot(nextStatus), records: [] }),
    );
  }

  async function getPersistedRecordsTokenSnapshot(): Promise<PersistedRecordsTokenSnapshot> {
    return deps.safeDatabaseOperation(
      () => {
        const currentStatus = deps.getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase === 'locked') {
          return emptyTokenSnapshot(currentStatus);
        }

        const db = deps.requireDatabase();
        const latestRow = db
          .prepare('SELECT updated_at FROM persisted_records ORDER BY updated_at DESC LIMIT 1')
          .get();
        const latestUpdatedAt = isUpdatedAtRow(latestRow) ? latestRow.updated_at : null;
        return {
          status: currentStatus,
          refreshToken: readRefreshToken(db),
          latestUpdatedAt,
          taskRecordsUpdatedAt: deps.getTaskRecordsUpdatedAt(db),
          sorteosDrawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
          sorteosExclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
          directStoreUpdatedAt: getDirectStoreUpdatedAtSnapshot(db),
        };
      },
      (nextStatus) => emptyTokenSnapshot(nextStatus),
    );
  }

  return {
    updateRefreshMetadata,
    savePersistedRecord,
    savePersistedRecordIfUnchanged,
    migrateLocalStorageSnapshot,
    getPersistedRecordSnapshot,
    loadPersistedRecordsHydrationSnapshot,
    loadPersistedRecordsSnapshot,
    getPersistedRecordsTokenSnapshot,
  };
}
