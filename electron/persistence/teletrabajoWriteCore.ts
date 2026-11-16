/** Reusable Teletrabajo SQL write, called ONLY inside an existing atomic transaction.
 * Caller owns the database handle, SMB lock and post-commit backup.
 */
import type { Database } from 'better-sqlite3';
import type { ConditionalSqliteTaskSaveResult, DatabaseStatus } from '../sqlitePersistence.js';
import type { ConditionalSqliteTeletrabajoRecord } from './teletrabajoRepository.js';

function isUpdatedAtRow(value: unknown): value is {updated_at:string} {
  return !!value && typeof value === 'object' && typeof (value as {updated_at?:unknown}).updated_at === 'string';
}

export function saveTeletrabajoRecordInTransaction(
  db: Database,
  record: ConditionalSqliteTeletrabajoRecord,
  currentStatus: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
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

export class TeletrabajoBatchSaveError extends Error {
  constructor(
    public readonly recordId: string,
    public readonly saveResult: ConditionalSqliteTaskSaveResult,
  ) {
    super(saveResult.message);
  }
}


/** Batch is all-or-nothing. A failed OCC check throws inside SQLite transaction.
 * The result identifies only the failed record; no preceding writes are committed.
 */
export function saveTeletrabajoBatchTransaction(
  db: Database,
  records: ConditionalSqliteTeletrabajoRecord[],
  status: DatabaseStatus,
  migrateLegacy: (db: Database) => void,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): ConditionalSqliteTaskSaveResult[] {
  return db.transaction(() => {
    migrateLegacy(db);
    return records.map(record => {
      const result = saveTeletrabajoRecordInTransaction(db, record, status, updateRefreshMetadata);
      if (!result.ok) throw new TeletrabajoBatchSaveError(record.id, result);
      return result;
    });
  })();
}

export function saveTeletrabajoSingleTransaction(
  db: Database,
  record: ConditionalSqliteTeletrabajoRecord,
  status: DatabaseStatus,
  migrateLegacy: (db: Database) => void,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): ConditionalSqliteTaskSaveResult {
  return db.transaction(() => {
    migrateLegacy(db);
    return saveTeletrabajoRecordInTransaction(db, record, status, updateRefreshMetadata);
  })();
}
