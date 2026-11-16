/**
 * Mismo cierre SQL atómico en main y futuro utilityProcess.
 * NO adquiere un lock SMB por sí mismo: su invocador debe conservar la
 * propiedad SQLite y la barrera de admisión durante toda la operación.
 * No se conecta todavía al worker de producción.
 */
import type { Database } from 'better-sqlite3';
import type {
  AtomicSessionWorkflowPayload,
  AtomicSessionWorkflowResult,
  AtomicSessionWorkflowRecord,
  DatabaseStatus,
} from '../sqlitePersistence.js';
import { findForeignTaskEditingLock } from './recordLocks.js';
import { isUpdatedAtRow } from './sqlitePersistenceHelpers.js';

export function closeSessionWorkflowTransaction(
  db: Database,
  payload: AtomicSessionWorkflowPayload,
  currentStatus: DatabaseStatus,
  ownerId: string,
  updateRefreshMetadata: (database: Database, updatedAt: string) => void,
): AtomicSessionWorkflowResult {
  if (!ownerId.trim() || !['comite', 'paritaria'].includes(payload.module) ||
      !payload.session?.id?.trim() || typeof payload.session.value !== 'string' ||
      !Array.isArray(payload.tasks) ||
      payload.tasks.some(task => !task?.id?.trim() || typeof task.value !== 'string')) {
    throw new Error('Cierre de sesión atómico inválido.');
  }
      const sessionTable =
        payload.module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';

      const result = db.transaction((): AtomicSessionWorkflowResult => {
        const readUpdatedAt = (tableName: string, id: string): string | null => {
          const row = db
            .prepare(`SELECT updated_at FROM ${tableName} WHERE id = ? AND deleted_at IS NULL`)
            .get(id);
          return isUpdatedAtRow(row) ? row.updated_at : null;
        };

        const currentSessionUpdatedAt = readUpdatedAt(sessionTable, payload.session.id);
        if (currentSessionUpdatedAt !== payload.session.expectedUpdatedAt) {
          return {
            ok: false,
            status: currentStatus,
            message:
              'La sesión ha sido modificada por otro usuario. Recarga antes de cerrarla.',
          };
        }

        for (const task of payload.tasks) {
          const conflictingEditor = findForeignTaskEditingLock(db, task.id, ownerId);
          if (conflictingEditor) {
            return {
              ok: false,
              status: currentStatus,
              message: `No se puede cerrar la sesión: la tarea está siendo editada por ${conflictingEditor.ownerName}@${conflictingEditor.machineName}.`,
            };
          }
          const currentTaskUpdatedAt = readUpdatedAt('task_records', task.id);
          if (currentTaskUpdatedAt !== task.expectedUpdatedAt) {
            return {
              ok: false,
              status: currentStatus,
              message:
                'Una de las tareas tratadas ha sido modificada por otro usuario. Recarga antes de cerrar la sesión.',
            };
          }
        }

        if (payload.acta) {
          const existingRows = db
            .prepare('SELECT value_json FROM acta_records WHERE deleted_at IS NULL')
            .all() as Array<{ value_json?: unknown }>;
          const existingActa = existingRows.some((row) => {
            if (typeof row.value_json !== 'string') {
              return false;
            }
            try {
              const parsed = JSON.parse(row.value_json) as { sourceSessionId?: unknown };
              return parsed.sourceSessionId === payload.acta?.sourceSessionId;
            } catch {
              return false;
            }
          });
          if (existingActa) {
            return {
              ok: false,
              status: currentStatus,
              message:
                'Ya existe un acta vinculada a esta sesión. Recarga antes de continuar.',
            };
          }
        }

        const parseRecordMeta = (value: string) => {
          let parsed: Record<string, unknown> = {};
          try {
            const candidate = JSON.parse(value);
            if (candidate && typeof candidate === 'object') {
              parsed = candidate as Record<string, unknown>;
            }
          } catch {
            // La validación funcional se realiza en renderer/store; aquí solo protegemos atomicidad.
          }
          const now = new Date().toISOString();
          return {
            createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
            deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
          };
        };

        const updateExisting = (
          tableName: string,
          record: AtomicSessionWorkflowRecord,
        ): void => {
          const meta = parseRecordMeta(record.value);
          const updateResult = db
            .prepare(
              `UPDATE ${tableName}
               SET value_json = ?, updated_at = ?, deleted_at = ?
               WHERE id = ? AND updated_at = ?`,
            )
            .run(
              record.value,
              meta.updatedAt,
              meta.deletedAt,
              record.id,
              record.expectedUpdatedAt,
            );
          if (updateResult.changes !== 1) {
            throw new Error('Conflicto de concurrencia durante el cierre de la sesión.');
          }
        };

        updateExisting(sessionTable, payload.session);
        for (const task of payload.tasks) {
          updateExisting('task_records', task);
        }

        if (payload.acta) {
          const meta = parseRecordMeta(payload.acta.value);
          const insertResult = db
            .prepare(
              `INSERT INTO acta_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            )
            .run(
              payload.acta.id,
              payload.acta.value,
              meta.createdAt,
              meta.updatedAt,
              meta.deletedAt,
            );
          if (insertResult.changes !== 1) {
            throw new Error('No se ha podido crear el acta asociada.');
          }
        }

        const refreshUpdatedAt = new Date().toISOString();
        updateRefreshMetadata(db, refreshUpdatedAt);
        return {
          ok: true,
          status: currentStatus,
          message: 'Sesión, tareas y acta actualizadas de forma atómica.',
        };
      })();
}
