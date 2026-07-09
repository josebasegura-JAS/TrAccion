import type { Database } from 'better-sqlite3';
import { maybeMigrateJsonArrayRecordsFromPersistedRecord, readActiveJsonRecords } from './jsonRecordRepository.js';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from '../sqlitePersistence.js';

/**
 * Comité, Paritaria y Actas comparten exactamente la misma forma de
 * registro (id/value/expectedUpdatedAt) y el mismo patrón de guardado
 * condicional, así que Paritaria y Actas son alias de los tipos de Comité,
 * igual que ya estaba en sqlitePersistence.ts. Teletrabajo también reutiliza
 * esta misma forma, pero su repositorio se extraerá aparte más adelante; por
 * eso sqlitePersistence.ts sigue definiendo sus propios alias apuntando
 * aquí en vez de que este fichero conozca nada de Teletrabajo.
 */
export interface SqliteComiteSessionRecord {
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface SqliteComiteSessionRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteComiteSessionRecord[];
}

export interface ConditionalSqliteComiteSessionRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export type SqliteParitariaSessionRecord = SqliteComiteSessionRecord;

export interface SqliteParitariaSessionRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteParitariaSessionRecord[];
}

export type ConditionalSqliteParitariaSessionRecord = ConditionalSqliteComiteSessionRecord;

export type SqliteActaRecord = SqliteComiteSessionRecord;

export interface SqliteActaRecordsSnapshot {
  status: DatabaseStatus;
  records: SqliteActaRecord[];
}

export type ConditionalSqliteActaRecord = ConditionalSqliteComiteSessionRecord;

/**
 * Dependencias de orquestación que siguen viviendo en sqlitePersistence.ts
 * (safeDatabaseOperation, guards de fila genéricos, backups, etc.) y se
 * pasan ya construidas, igual que en el resto de repositorios extraídos,
 * para evitar una dependencia circular en tiempo de ejecución.
 */
export interface SesionesRepositoryDeps {
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

export interface SesionesRepositoryApi {
  loadComiteSessionRecordsSnapshot: () => Promise<SqliteComiteSessionRecordsSnapshot>;
  saveComiteSessionRecordIfUnchanged: (
    record: ConditionalSqliteComiteSessionRecord,
  ) => Promise<ConditionalSqliteTaskSaveResult>;
  loadParitariaSessionRecordsSnapshot: () => Promise<SqliteParitariaSessionRecordsSnapshot>;
  saveParitariaSessionRecordIfUnchanged: (
    record: ConditionalSqliteParitariaSessionRecord,
  ) => Promise<ConditionalSqliteTaskSaveResult>;
  loadActaRecordsSnapshot: () => Promise<SqliteActaRecordsSnapshot>;
  saveActaRecordIfUnchanged: (record: ConditionalSqliteActaRecord) => Promise<ConditionalSqliteTaskSaveResult>;
  /** Debe llamarse junto al resto de flags de migración al cerrar/cambiar de base. */
  resetMigrationState: () => void;
}

/**
 * Los 3 flags de migración (antes comiteSessionsMigrationDone,
 * paritariaSessionsMigrationDone y actasMigrationDone, variables sueltas a
 * nivel de módulo en sqlitePersistence.ts) viven ahora en el closure de
 * esta factoría, uno por módulo.
 *
 * Nota: saveComiteSessionRecordIfUnchanged, saveParitariaSessionRecordIfUnchanged
 * y saveActaRecordIfUnchanged son casi idénticas (mismo patrón OCC, solo
 * cambia el nombre de tabla y los textos). Se mantienen separadas tal cual
 * estaban en sqlitePersistence.ts -- este incremento es solo mover código,
 * no refactorizarlo; unificarlas sería un cambio de comportamiento/riesgo
 * aparte que merece su propio incremento si se quiere hacer más adelante.
 */
export function createSesionesRepository(deps: SesionesRepositoryDeps): SesionesRepositoryApi {
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

  let comiteSessionsMigrationDone = false;
  let paritariaSessionsMigrationDone = false;
  let actasMigrationDone = false;

  function readComiteSessionRecords(db: Database): SqliteComiteSessionRecord[] {
    return readActiveJsonRecords(db, 'comite_session_records');
  }

  function maybeMigrateComiteSessionsFromPersistedRecord(db: Database): void {
    comiteSessionsMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
      tableName: 'comite_session_records',
      legacyKey: 'traccion.v1.comite.sessions',
      migrationDone: comiteSessionsMigrationDone,
    });
  }

  async function loadComiteSessionRecordsSnapshot(): Promise<SqliteComiteSessionRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateComiteSessionsFromPersistedRecord(db))();
        return { status: currentStatus, records: readComiteSessionRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  function readParitariaSessionRecords(db: Database): SqliteParitariaSessionRecord[] {
    return readActiveJsonRecords(db, 'paritaria_session_records');
  }

  function maybeMigrateParitariaSessionsFromPersistedRecord(db: Database): void {
    paritariaSessionsMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
      tableName: 'paritaria_session_records',
      legacyKey: 'traccion.v1.paritaria.sessions',
      migrationDone: paritariaSessionsMigrationDone,
    });
  }

  async function loadParitariaSessionRecordsSnapshot(): Promise<SqliteParitariaSessionRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateParitariaSessionsFromPersistedRecord(db))();
        return { status: currentStatus, records: readParitariaSessionRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  function readActaRecords(db: Database): SqliteActaRecord[] {
    return readActiveJsonRecords(db, 'acta_records');
  }

  function maybeMigrateActasFromPersistedRecord(db: Database): void {
    actasMigrationDone = maybeMigrateJsonArrayRecordsFromPersistedRecord(db, {
      tableName: 'acta_records',
      legacyKey: 'traccion.v1.actas.records',
      migrationDone: actasMigrationDone,
    });
  }

  async function loadActaRecordsSnapshot(): Promise<SqliteActaRecordsSnapshot> {
    return safeDatabaseOperation(
      () => {
        const currentStatus = getSqliteStatus();
        if (!currentStatus.ready || currentStatus.phase !== 'active') {
          return { status: currentStatus, records: [] };
        }

        const db = requireDatabase();
        db.transaction(() => maybeMigrateActasFromPersistedRecord(db))();
        return { status: currentStatus, records: readActaRecords(db) };
      },
      (nextStatus) => ({ status: nextStatus, records: [] }),
    );
  }

  async function saveComiteSessionRecordIfUnchanged(
    record: ConditionalSqliteComiteSessionRecord,
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
          maybeMigrateComiteSessionsFromPersistedRecord(db);
          const row = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
          const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt,
              message: 'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
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
                `INSERT OR IGNORE INTO comite_session_records (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(record.id, record.value, createdAt, updatedAt, deletedAt);

            if (insertResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'La sesión ya existe en la base compartida. Recarga antes de continuar.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE comite_session_records
                 SET value_json = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ? AND updated_at = ?`,
              )
              .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

            if (updateResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM comite_session_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
              };
            }
          }

          updateRefreshMetadata(db, updatedAt);

          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: updatedAt,
            message: 'Sesión de comité guardada en SQLite.',
          };
        })();

        if (result.ok) {
          enqueueLocalBackup('save:comite_session_records');
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

  async function saveParitariaSessionRecordIfUnchanged(
    record: ConditionalSqliteParitariaSessionRecord,
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
          maybeMigrateParitariaSessionsFromPersistedRecord(db);
          const row = db.prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?').get(record.id);
          const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt,
              message: 'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
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
                `INSERT OR IGNORE INTO paritaria_session_records (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(record.id, record.value, createdAt, updatedAt, deletedAt);

            if (insertResult.changes !== 1) {
              const latest = db
                .prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?')
                .get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'La sesión ya existe en la base compartida. Recarga antes de continuar.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE paritaria_session_records
                 SET value_json = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ? AND updated_at = ?`,
              )
              .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

            if (updateResult.changes !== 1) {
              const latest = db
                .prepare('SELECT updated_at FROM paritaria_session_records WHERE id = ?')
                .get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
              };
            }
          }

          updateRefreshMetadata(db, updatedAt);

          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: updatedAt,
            message: 'Sesión de paritaria guardada en SQLite.',
          };
        })();

        if (result.ok) {
          enqueueLocalBackup('save:paritaria_session_records');
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

  async function saveActaRecordIfUnchanged(
    record: ConditionalSqliteActaRecord,
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
          maybeMigrateActasFromPersistedRecord(db);
          const row = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
          const currentUpdatedAt = isUpdatedAtRow(row) ? row.updated_at : null;

          if (currentUpdatedAt !== record.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              currentUpdatedAt,
              message: 'El acta ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
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
                `INSERT OR IGNORE INTO acta_records (id, value_json, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, ?)`,
              )
              .run(record.id, record.value, createdAt, updatedAt, deletedAt);

            if (insertResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'El acta ya existe en la base compartida. Recarga antes de continuar.',
              };
            }
          } else {
            const updateResult = db
              .prepare(
                `UPDATE acta_records
                 SET value_json = ?, updated_at = ?, deleted_at = ?
                 WHERE id = ? AND updated_at = ?`,
              )
              .run(record.value, updatedAt, deletedAt, record.id, currentUpdatedAt);

            if (updateResult.changes !== 1) {
              const latest = db.prepare('SELECT updated_at FROM acta_records WHERE id = ?').get(record.id);
              return {
                ok: false,
                status: currentStatus,
                currentUpdatedAt: isUpdatedAtRow(latest) ? latest.updated_at : null,
                message: 'El acta ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
              };
            }
          }

          updateRefreshMetadata(db, updatedAt);

          return {
            ok: true,
            status: currentStatus,
            currentUpdatedAt: updatedAt,
            message: 'Acta guardada en SQLite.',
          };
        })();

        if (result.ok) {
          enqueueLocalBackup('save:acta_records');
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
    loadComiteSessionRecordsSnapshot,
    saveComiteSessionRecordIfUnchanged,
    loadParitariaSessionRecordsSnapshot,
    saveParitariaSessionRecordIfUnchanged,
    loadActaRecordsSnapshot,
    saveActaRecordIfUnchanged,
    resetMigrationState: () => {
      comiteSessionsMigrationDone = false;
      paritariaSessionsMigrationDone = false;
      actasMigrationDone = false;
    },
  };
}
