/**
 * Operaciones SQL indivisibles de Coordinación, compartidas entre main y
 * futuros procesos auxiliares. El llamador conserva el lock SMB, la
 * propiedad del handle y la programación posterior del backup.
 */
import type { Database } from 'better-sqlite3';
import type {
  AtomicCoordinationWorkflowPayload, AtomicCoordinationWorkflowResult,
  AtomicCoordinationTaskCreationPayload, AtomicCoordinationTaskCreationResult,
  AtomicCoordinationWorkflowRecord, AtomicSessionWorkflowRecord, DatabaseStatus,
} from '../sqlitePersistence.js';

export function closeCoordinationWorkflowTransaction(
  db: Database,
  payload: AtomicCoordinationWorkflowPayload,
  currentStatus: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): AtomicCoordinationWorkflowResult {
      const result = db.transaction((): AtomicCoordinationWorkflowResult => {
        const readPersistedUpdatedAt = (key: string): string | null => {
          const row = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(key) as { updated_at?: unknown } | undefined;
          return typeof row?.updated_at === 'string' ? row.updated_at : null;
        };
        const readTaskUpdatedAt = (id: string): string | null => {
          const row = db.prepare('SELECT updated_at FROM task_records WHERE id = ? AND deleted_at IS NULL').get(id) as { updated_at?: unknown } | undefined;
          return typeof row?.updated_at === 'string' ? row.updated_at : null;
        };

        if (readPersistedUpdatedAt(payload.meeting.key) !== payload.meeting.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'La reunión ha sido modificada por otro usuario. Recarga antes de cerrarla.' };
        }
        if (readPersistedUpdatedAt(payload.index.key) !== payload.index.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'Coordinación ha sido modificada por otro usuario. Recarga antes de cerrar la reunión.' };
        }
        for (const task of payload.tasks) {
          if (readTaskUpdatedAt(task.id) !== task.expectedUpdatedAt) {
            return { ok: false, status: currentStatus, message: 'Una de las tareas seleccionadas ha sido modificada por otro usuario. Recarga antes de cerrar la reunión.' };
          }
        }

        const now = new Date().toISOString();
        const updatePersisted = (record: AtomicCoordinationWorkflowRecord): void => {
          const update = db.prepare(
            `UPDATE persisted_records
             SET value_json = ?, source = 'sqlite-primary', updated_at = ?
             WHERE key = ? AND updated_at = ?`,
          ).run(record.value, now, record.key, record.expectedUpdatedAt);
          if (update.changes !== 1) throw new Error('Conflicto de concurrencia durante el cierre de Coordinación.');
        };
        const updateTask = (record: AtomicSessionWorkflowRecord): void => {
          let parsed: Record<string, unknown> = {};
          try {
            const candidate = JSON.parse(record.value);
            if (candidate && typeof candidate === 'object') parsed = candidate as Record<string, unknown>;
          } catch {
            // The renderer/store has already validated the task record shape.
          }
          const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now;
          const deletedAt = typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null;
          const update = db.prepare(
            `UPDATE task_records
             SET value_json = ?, updated_at = ?, deleted_at = ?
             WHERE id = ? AND updated_at = ?`,
          ).run(record.value, updatedAt, deletedAt, record.id, record.expectedUpdatedAt);
          if (update.changes !== 1) throw new Error('Conflicto de concurrencia durante el cierre de tareas de Coordinación.');
        };

        updatePersisted(payload.meeting);
        updatePersisted(payload.index);
        for (const task of payload.tasks) updateTask(task);
        updateRefreshMetadata(db, now);
        return {
          ok: true,
          status: currentStatus,
          message: 'Reunión y tareas cerradas de forma atómica.',
          meetingUpdatedAt: now,
          indexUpdatedAt: now,
        };
      })();
  return result;
}

export function createCoordinationTaskTransaction(
  db: Database,
  payload: AtomicCoordinationTaskCreationPayload,
  currentStatus: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): AtomicCoordinationTaskCreationResult {
      const result = db.transaction((): AtomicCoordinationTaskCreationResult => {
        const readPersistedUpdatedAt = (key: string): string | null => {
          const row = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(key) as { updated_at?: unknown } | undefined;
          return typeof row?.updated_at === 'string' ? row.updated_at : null;
        };
        if (readPersistedUpdatedAt(payload.meeting.key) !== payload.meeting.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'La reunión ha sido modificada por otro usuario. Recarga antes de crear la tarea.' };
        }
        if (readPersistedUpdatedAt(payload.index.key) !== payload.index.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'Coordinación ha sido modificada por otro usuario. Recarga antes de crear la tarea.' };
        }
        const existingTask = db.prepare('SELECT id FROM task_records WHERE id = ?').get(payload.task.id);
        if (existingTask) {
          return { ok: false, status: currentStatus, message: 'La tarea ya existe. Recarga antes de volver a intentarlo.' };
        }

        const now = new Date().toISOString();
        const updatePersisted = (record: AtomicCoordinationWorkflowRecord): void => {
          const update = db.prepare(
            `UPDATE persisted_records
             SET value_json = ?, source = 'sqlite-primary', updated_at = ?
             WHERE key = ? AND updated_at = ?`,
          ).run(record.value, now, record.key, record.expectedUpdatedAt);
          if (update.changes !== 1) throw new Error('Conflicto de concurrencia al vincular la nueva tarea con Coordinación.');
        };

        let parsed: Record<string, unknown> = {};
        try {
          const candidate = JSON.parse(payload.task.value);
          if (candidate && typeof candidate === 'object') parsed = candidate as Record<string, unknown>;
        } catch {
          // El renderer ya ha validado la estructura funcional de la tarea.
        }
        const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : now;
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now;
        const deletedAt = typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null;

        updatePersisted(payload.meeting);
        updatePersisted(payload.index);
        const insert = db.prepare(
          `INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(payload.task.id, payload.task.value, createdAt, updatedAt, deletedAt);
        if (insert.changes !== 1) throw new Error('No se ha podido crear la tarea vinculada a Coordinación.');

        updateRefreshMetadata(db, now);
        return {
          ok: true,
          status: currentStatus,
          message: 'Tarea creada y vinculada a Coordinación de forma atómica.',
          meetingUpdatedAt: now,
          indexUpdatedAt: now,
        };
      })();
  return result;
}

