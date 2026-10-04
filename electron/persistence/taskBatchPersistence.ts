import type { Database } from 'better-sqlite3';
import { DATABASE_HEARTBEAT_BLOCKED_MESSAGE } from './databaseLockManager.js';
import { openSqliteDatabase } from './sqliteConnection.js';
import { createSqliteLockLifecycle } from './sqliteLockLifecycle.js';
import { createVolatileOwnerId } from './stableOwnerIdentity.js';
import {
  getSqliteStatus,
  loadTaskRecordsSnapshot,
  type DatabaseStatus,
} from '../sqlitePersistence.js';

const SQLITE_BUSY_TIMEOUT_MS = 15_000;
const batchOwnerId = createVolatileOwnerId();
const batchLockLifecycle = createSqliteLockLifecycle(() => batchOwnerId);

export interface AtomicTaskRecord {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export interface AtomicTaskBatchSaveResult {
  ok: boolean;
  status: DatabaseStatus;
  message: string;
  saved: number;
}

class TaskBatchRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskBatchRejected';
  }
}

function readUpdatedAt(row: unknown): string | null {
  return row && typeof row === 'object' && typeof (row as { updated_at?: unknown }).updated_at === 'string'
    ? (row as { updated_at: string }).updated_at
    : null;
}

function parseTaskMeta(value: string): {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
} {
  const now = new Date().toISOString();
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
      deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
    };
  } catch {
    return { createdAt: now, updatedAt: now, deletedAt: null };
  }
}

export function saveTaskRecordsInTransaction(
  db: Database,
  records: AtomicTaskRecord[],
  status: DatabaseStatus,
): AtomicTaskBatchSaveResult {
  const uniqueIds = new Set<string>();
  for (const record of records) {
    if (!record.id || uniqueIds.has(record.id)) {
      throw new TaskBatchRejected('El lote de tareas contiene identificadores vacíos o duplicados.');
    }
    uniqueIds.add(record.id);
  }

  return db.transaction((): AtomicTaskBatchSaveResult => {
    const selectCurrent = db.prepare('SELECT updated_at FROM task_records WHERE id = ?');
    const currentById = new Map<string, string | null>();

    // Preflight completo: ningún INSERT/UPDATE se ejecuta hasta comprobar todo el lote.
    for (const record of records) {
      const currentUpdatedAt = readUpdatedAt(selectCurrent.get(record.id));
      currentById.set(record.id, currentUpdatedAt);
      if (currentUpdatedAt !== record.expectedUpdatedAt) {
        throw new TaskBatchRejected(
          record.expectedUpdatedAt === null && currentUpdatedAt !== null
            ? 'Una de las tareas importadas ya existe. Recarga antes de volver a importar.'
            : 'Una de las tareas ha sido modificada por otro usuario durante la importación. Recarga antes de volver a importar.',
        );
      }
    }

    const insertRecord = db.prepare(
      `INSERT OR IGNORE INTO task_records (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const updateRecord = db.prepare(
      `UPDATE task_records
       SET value_json = ?, updated_at = ?, deleted_at = ?
       WHERE id = ? AND updated_at = ?`,
    );

    let saved = 0;
    for (const record of records) {
      const currentUpdatedAt = currentById.get(record.id) ?? null;
      const meta = parseTaskMeta(record.value);

      if (currentUpdatedAt === null) {
        const result = insertRecord.run(
          record.id,
          record.value,
          meta.createdAt,
          meta.updatedAt,
          meta.deletedAt,
        );
        if (result.changes !== 1) {
          throw new TaskBatchRejected(
            'Una de las tareas importadas ya existe. No se ha guardado ninguna tarea del lote.',
          );
        }
      } else {
        const result = updateRecord.run(
          record.value,
          meta.updatedAt,
          meta.deletedAt,
          record.id,
          currentUpdatedAt,
        );
        if (result.changes !== 1) {
          throw new TaskBatchRejected(
            'Una de las tareas cambió durante la importación. No se ha guardado ninguna tarea del lote.',
          );
        }
      }
      saved += 1;
    }

    const refreshUpdatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO app_metadata (key, value, updated_at)
       VALUES ('persisted_records_refresh_token', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(`${refreshUpdatedAt}:${batchOwnerId}`, refreshUpdatedAt);

    return {
      ok: true,
      status,
      message: `${saved} tareas guardadas de forma atómica en SQLite.`,
      saved,
    };
  })();
}

export async function saveTaskRecordsAtomically(
  records: AtomicTaskRecord[],
): Promise<AtomicTaskBatchSaveResult> {
  let currentStatus = getSqliteStatus();
  if (
    !currentStatus.ready ||
    currentStatus.phase !== 'active' ||
    currentStatus.isDefaultPath ||
    currentStatus.message === DATABASE_HEARTBEAT_BLOCKED_MESSAGE
  ) {
    return {
      ok: false,
      status: currentStatus,
      message: currentStatus.message ?? 'SQLite compartida no está disponible.',
      saved: 0,
    };
  }

  if (records.length === 0) {
    return { ok: true, status: currentStatus, message: 'No hay tareas que guardar.', saved: 0 };
  }

  // Fuerza la migración legacy antes de insertar la primera tarea nativa. Si no se
  // hiciera, un lote nuevo podría hacer que la migración posterior creyera que la
  // tabla ya estaba poblada y omitiera tareas históricas aún no migradas.
  const migratedSnapshot = await loadTaskRecordsSnapshot({ mode: 'all' });
  if (!migratedSnapshot.status.ready || migratedSnapshot.status.phase !== 'active') {
    return {
      ok: false,
      status: migratedSnapshot.status,
      message: migratedSnapshot.status.message ?? 'No se ha podido preparar la tabla de tareas.',
      saved: 0,
    };
  }

  currentStatus = getSqliteStatus();

  try {
    return await batchLockLifecycle.withDatabaseOperationLock(currentStatus.path, async () => {
      const db = openSqliteDatabase(currentStatus.path, { busyTimeoutMs: SQLITE_BUSY_TIMEOUT_MS });
      try {
        return saveTaskRecordsInTransaction(db, records, currentStatus);
      } finally {
        db.close();
      }
    });
  } catch (error) {
    if (error instanceof TaskBatchRejected) {
      return { ok: false, status: currentStatus, message: error.message, saved: 0 };
    }
    return {
      ok: false,
      status: currentStatus,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el lote de tareas.',
      saved: 0,
    };
  }
}
