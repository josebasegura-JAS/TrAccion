import { transactionWithMigrationReset, withMigrationFlagRollback } from './migrationRollbackGuard.js';
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus, PersistedStorageRecordSnapshot } from '../sqlitePersistence.js';

export interface SqliteSorteosRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteSorteosRecordsSnapshot {
  status: DatabaseStatus;
  draws: SqliteSorteosRecord[];
  exclusions: SqliteSorteosRecord[];
  drawsUpdatedAt: string | null;
  exclusionsUpdatedAt: string | null;
}

export interface ConditionalSqliteSorteosSnapshot {
  draws: Array<{ id: string; value: string }>;
  exclusions: Array<{ id: string; value: string }>;
  expectedDrawsUpdatedAt: string | null;
  expectedExclusionsUpdatedAt: string | null;
}

export interface ConditionalSqliteSorteosSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  currentDrawsUpdatedAt: string | null;
  currentExclusionsUpdatedAt: string | null;
  message: string;
}

type SorteosTableName = 'sorteos_draw_records' | 'sorteos_exclusion_records';

interface SorteosRecordRow {
  id: string;
  value_json: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function isSorteosRecordRow(value: unknown): value is SorteosRecordRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<SorteosRecordRow>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.value_json === 'string' &&
    typeof candidate.created_at === 'string' &&
    typeof candidate.updated_at === 'string' &&
    (candidate.deleted_at === null || typeof candidate.deleted_at === 'string')
  );
}

function mapSorteosRecordRow(row: SorteosRecordRow): SqliteSorteosRecord {
  return {
    id: row.id,
    value: row.value_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function readAllSorteosRows(db: Database, tableName: SorteosTableName): SqliteSorteosRecord[] {
  return db
    .prepare(
      `SELECT id, value_json, created_at, updated_at, deleted_at FROM ${tableName} WHERE deleted_at IS NULL ORDER BY created_at, id`,
    )
    .all()
    .filter(isSorteosRecordRow)
    .map(mapSorteosRecordRow);
}

/**
 * Usada tanto por el load/save de Sorteos como por
 * loadPersistedRecordsSnapshot en sqlitePersistence.ts (que reporta el
 * updatedAt de Sorteos junto con el del resto de módulos). Por eso se
 * exporta suelta, sin pasar por la factoría con dependencias inyectadas.
 */
export function getSorteosCollectionUpdatedAt(db: Database, tableName: SorteosTableName): string | null {
  const row = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM ${tableName}`).get();
  return row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'
    ? (row as { updated_at: string }).updated_at
    : null;
}

function replaceSorteosTable(
  db: Database,
  tableName: SorteosTableName,
  records: Array<{ id: string; value: string }>,
  timestamp: string,
): void {
  const incomingIds = new Set(records.map((record) => record.id));
  const existingRows = db
    .prepare(`SELECT id, value_json, created_at, updated_at, deleted_at FROM ${tableName}`)
    .all();
  const existingById = new Map<string, { value_json: string; created_at: string }>();

  for (const row of existingRows) {
    if (isSorteosRecordRow(row)) {
      existingById.set(row.id, { value_json: row.value_json, created_at: row.created_at });
    }
  }

  const upsert = db.prepare(
    `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at, deleted_at = NULL`,
  );

  for (const record of records) {
    const existing = existingById.get(record.id);
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.value);
    } catch {
      parsed = null;
    }
    const createdAt =
      existing?.created_at ??
      (parsed && typeof parsed === 'object' && typeof (parsed as { createdAt?: unknown }).createdAt === 'string'
        ? (parsed as { createdAt: string }).createdAt
        : timestamp);
    upsert.run(record.id, record.value, createdAt, timestamp);
  }

  const markDeleted = db.prepare(
    `UPDATE ${tableName} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
  );
  for (const id of existingById.keys()) {
    if (!incomingIds.has(id)) {
      markDeleted.run(timestamp, timestamp, id);
    }
  }
}

/** Guardado atómico de sorteos + exclusiones con OCC por colección.
 * La migración legacy se inyecta y ejecuta DENTRO de la misma transacción.
 * El caller mantiene el lock SMB, el handle y el backup. */
export function saveSorteosTransaction(
  db: Database,
  snapshot: ConditionalSqliteSorteosSnapshot,
  status: DatabaseStatus,
  migrateLegacy: (db: Database) => void,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): ConditionalSqliteSorteosSaveResult {
        const result = db.transaction((): ConditionalSqliteSorteosSaveResult => {
          migrateLegacy(db);
          const currentDrawsUpdatedAt = getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records');
          const currentExclusionsUpdatedAt = getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records');

          if (
            currentDrawsUpdatedAt !== snapshot.expectedDrawsUpdatedAt ||
            currentExclusionsUpdatedAt !== snapshot.expectedExclusionsUpdatedAt
          ) {
            return {
              ok: false,
              status: status,
              currentDrawsUpdatedAt,
              currentExclusionsUpdatedAt,
              message:
                'Los sorteos han cambiado mientras guardabas. Recarga antes de continuar para no sobrescribir cambios.',
            };
          }

          const now = new Date().toISOString();
          replaceSorteosTable(db, 'sorteos_draw_records', snapshot.draws, now);
          replaceSorteosTable(db, 'sorteos_exclusion_records', snapshot.exclusions, now);
          updateRefreshMetadata(db, now);

          return {
            ok: true,
            status: status,
            currentDrawsUpdatedAt: now,
            currentExclusionsUpdatedAt: now,
            message: 'Sorteos guardados en SQLite.',
          };
        })();
  return result;
}

/** Legacy migration shared by main and utilityProcess.
 * Must run in the same transaction as the actual write, or as an
 * explicitly fenced migration. Never run on a read-only connection.
 */
export function migrateSorteosLegacyInTransaction(
  db: Database,
  readLegacyValue: (db: Database, key: string) => string | null = (database, key) => {
    const row = database.prepare('SELECT value_json FROM persisted_records WHERE key = ?')
      .get(key) as { value_json?: unknown } | undefined;
    return typeof row?.value_json === 'string' ? row.value_json : null;
  },
  isValidLegacyItem: (value: unknown) => value is { id: string; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown } =
    (value): value is { id: string } =>
      !!value && typeof value === 'object' && !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).id === 'string',
): void {
  const migrations = [
    ['sorteos_draw_records', 'traccion.v1.sorteos.draws'],
    ['sorteos_exclusion_records', 'traccion.v1.sorteos.exclusions'],
  ] as const;
  for (const [table, key] of migrations) {
    const count = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
    if (count.count > 0) continue;
    const legacyValue = readLegacyValue(db, key);
    if (typeof legacyValue !== 'string') continue;
    let parsed: unknown;
    try { parsed = JSON.parse(legacyValue); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT OR IGNORE INTO ${table} (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, NULL)`,
    );
    for (const item of parsed) {
      if (!isValidLegacyItem(item)) continue;
      const row = item as Record<string, unknown>;
      const createdAt = typeof row.createdAt === 'string' ? row.createdAt : now;
      const updatedAt = typeof row.updatedAt === 'string' ? row.updatedAt : createdAt;
      insert.run(row.id, JSON.stringify(item), createdAt, updatedAt);
    }
  }
}

/**
 * Dependencias de orquestación que siguen viviendo en sqlitePersistence.ts
 * (safeDatabaseOperation, guards de fila genéricos, backups, etc.) y se
 * pasan ya construidas, igual que en createJsonModuleRepository, para
 * evitar una dependencia circular en tiempo de ejecución.
 */
export interface SorteosRepositoryDeps {
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
  updateRefreshMetadata: (db: Database, updatedAt: string) => void;
  enqueueLocalBackup: (reason: string) => void;
  assertDatabaseWritesAllowed: () => void;
  isDatabaseWriteBlockedByHeartbeat: () => boolean;
}

export interface SorteosRepositoryApi {
  loadSorteosRecordsSnapshot: () => Promise<SqliteSorteosRecordsSnapshot>;
  saveSorteosSnapshotIfUnchanged: (
    snapshot: ConditionalSqliteSorteosSnapshot,
  ) => Promise<ConditionalSqliteSorteosSaveResult>;
  /** Debe llamarse junto al resto de flags de migración al cerrar/cambiar de base. */
  resetMigrationState: () => void;
}

/**
 * El flag de migración (antes sorteosMigrationDone, variable suelta a nivel
 * de módulo en sqlitePersistence.ts) vive ahora en el closure de esta
 * factoría.
 */
export function createSorteosRepository(deps: SorteosRepositoryDeps): SorteosRepositoryApi {
  const {
    safeDatabaseOperation,
    getSqliteStatus,
    requireDatabase,
    readPersistedRecordByKey,
    isJsonObjectWithStringId,
    updateRefreshMetadata,
    enqueueLocalBackup,
    assertDatabaseWritesAllowed,
    isDatabaseWriteBlockedByHeartbeat,
  } = deps;

  let sorteosMigrationDone = false;

  function maybeMigrateSorteosFromPersistedRecords(db: Database): void {
    if (sorteosMigrationDone) return;
    migrateSorteosLegacyInTransaction(
      db,
      (database, key) => readPersistedRecordByKey(database, key)?.value ?? null,
      isJsonObjectWithStringId,
    );
    sorteosMigrationDone = true;
  }

  async function loadSorteosRecordsSnapshot(): Promise<SqliteSorteosRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return {
            status: currentStatus,
            draws: [],
            exclusions: [],
            drawsUpdatedAt: null,
            exclusionsUpdatedAt: null,
          };
        }

        const db = requireDatabase();
        transactionWithMigrationReset(db, () => { sorteosMigrationDone = false; }, () => maybeMigrateSorteosFromPersistedRecords(db))();
        return {
          status: currentStatus,
          draws: readAllSorteosRows(db, 'sorteos_draw_records'),
          exclusions: readAllSorteosRows(db, 'sorteos_exclusion_records'),
          drawsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_draw_records'),
          exclusionsUpdatedAt: getSorteosCollectionUpdatedAt(db, 'sorteos_exclusion_records'),
        };
      },
      (nextStatus) => ({
        status: nextStatus,
        draws: [],
        exclusions: [],
        drawsUpdatedAt: null,
        exclusionsUpdatedAt: null,
      }),
    );
  }

  async function saveSorteosSnapshotIfUnchanged(
    snapshot: ConditionalSqliteSorteosSnapshot,
  ): Promise<ConditionalSqliteSorteosSaveResult> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
          return {
            ok: false,
            status: currentStatus,
            currentDrawsUpdatedAt: null,
            currentExclusionsUpdatedAt: null,
            message: currentStatus.message ?? 'SQLite no está activo. No se permite guardar sin base compartida.',
          };
        }

        assertDatabaseWritesAllowed();

        const db = requireDatabase();
        const result = withMigrationFlagRollback(() => { sorteosMigrationDone = false; }, () =>
          saveSorteosTransaction(
            db, snapshot, currentStatus, maybeMigrateSorteosFromPersistedRecords, updateRefreshMetadata,
          ),
        );

        if (result.ok) {
          enqueueLocalBackup('save:sorteos_records');
        }

        return result;
      },
      (nextStatus, message) => ({
        ok: false,
        status: nextStatus,
        currentDrawsUpdatedAt: null,
        currentExclusionsUpdatedAt: null,
        message,
      }),
    );
  }

  return {
    loadSorteosRecordsSnapshot,
    saveSorteosSnapshotIfUnchanged,
    resetMigrationState: () => {
      sorteosMigrationDone = false;
    },
  };
}
