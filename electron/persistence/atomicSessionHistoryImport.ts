/**
 * Importación histórica atómica compartida por Electron main y el futuro
 * escritor utilityProcess. NO adquiere el lock SMB; el llamador debe conservar
 * propiedad exclusiva, identidad verificada y barrera durante toda la operación.
 */
import type { Database } from 'better-sqlite3';
import type {
  AtomicSessionHistoryImportPayload,
  AtomicSessionHistoryImportResult,
  AtomicSessionHistoryImportSession,
  DatabaseStatus,
} from '../sqlitePersistence.js';

export function importSessionHistoryTransaction(
  db: Database,
  payload: AtomicSessionHistoryImportPayload,
  currentStatus: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): AtomicSessionHistoryImportResult {
  if (!payload || (payload.module !== 'comite' && payload.module !== 'paritaria') ||
      !Array.isArray(payload.sessions) || !Array.isArray(payload.tasks)) {
    throw new Error('Importación histórica inválida.');
  }
      const sessionTable =
        payload.module === 'comite' ? 'comite_session_records' : 'paritaria_session_records';

      const result = db.transaction((): AtomicSessionHistoryImportResult => {
        const parseObject = (value: string): Record<string, unknown> => {
          try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
          } catch {
            return {};
          }
        };
        const importKeyFrom = (value: unknown): string | null => {
          if (typeof value !== 'string') return null;
          return value.match(/ImportKey:([^\s]+)/)?.[1] ?? null;
        };
        const recordMeta = (value: string) => {
          const parsed = parseObject(value);
          const now = new Date().toISOString();
          return {
            createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : now,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now,
            deletedAt: typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null,
          };
        };

        // Decidir qué sesiones se insertarán a partir del estado REAL de SQLite,
        // dentro de la misma transacción que las tareas. La UI puede tener un
        // histórico parcial u obsoleto, por lo que su filtro no es autoritativo.
        const existingSessionImportKeys = new Set<string>();
        const existingSessionCodeDates = new Set<string>();
        const sessionRows = db.prepare(
          `SELECT value_json FROM ${sessionTable} WHERE deleted_at IS NULL`,
        ).all() as Array<{ value_json?: unknown }>;
        for (const row of sessionRows) {
          if (typeof row.value_json !== 'string') continue;
          const parsed = parseObject(row.value_json);
          const importKey = importKeyFrom(parsed.notes);
          if (importKey) existingSessionImportKeys.add(importKey);
          const code = typeof parsed.code === 'string' ? parsed.code.trim().toLowerCase() : '';
          const date = typeof parsed.date === 'string' ? parsed.date : '';
          if (code && date) existingSessionCodeDates.add(`${code}\u0000${date}`);
        }

        const importableSessions: Array<{
          session: AtomicSessionHistoryImportSession;
          parsed: Record<string, unknown>;
        }> = [];
        const neededTaskExternalKeys = new Set<string>();
        for (const session of payload.sessions) {
          const parsed = parseObject(session.value);
          const code = typeof parsed.code === 'string' ? parsed.code.trim().toLowerCase() : '';
          const date = typeof parsed.date === 'string' ? parsed.date : '';
          const codeDate = `${code}\u0000${date}`;
          if (
            existingSessionImportKeys.has(session.externalKey) ||
            (code && date && existingSessionCodeDates.has(codeDate))
          ) {
            continue;
          }

          // Reservar aquí también las claves del propio lote para que dos
          // sesiones duplicadas no puedan dejar puntos asociados a la descartada.
          existingSessionImportKeys.add(session.externalKey);
          if (code && date) existingSessionCodeDates.add(codeDate);
          importableSessions.push({ session, parsed });
          for (const key of session.taskExternalKeys) neededTaskExternalKeys.add(key);
        }

        const taskIdsByExternalKey = new Map<string, string>();
        let createdTaskCount = 0;
        if (importableSessions.length > 0) {
          const existingTaskRows = db.prepare(
            'SELECT id, value_json FROM task_records WHERE deleted_at IS NULL',
          ).all() as Array<{ id?: unknown; value_json?: unknown }>;
          for (const row of existingTaskRows) {
            if (typeof row.id !== 'string' || typeof row.value_json !== 'string') continue;
            const parsed = parseObject(row.value_json);
            const key = importKeyFrom(parsed.observaciones);
            if (key && neededTaskExternalKeys.has(key)) taskIdsByExternalKey.set(key, row.id);
          }

          for (const task of payload.tasks) {
            // Una tarea solo puede crearse si la referencia una sesión que
            // realmente se incorporará. No persistir tareas de duplicados.
            if (!neededTaskExternalKeys.has(task.externalKey)) continue;
            if (taskIdsByExternalKey.has(task.externalKey)) continue;
            const duplicateId = db.prepare('SELECT id FROM task_records WHERE id = ?').get(task.id) as { id?: unknown } | undefined;
            if (duplicateId) {
              throw new Error('Una tarea histórica generada ya existe con el mismo identificador. Reintenta la importación.');
            }
            const meta = recordMeta(task.value);
            const inserted = db.prepare(
              `INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at)
               VALUES (?, ?, ?, ?, ?)`,
            ).run(task.id, task.value, meta.createdAt, meta.updatedAt, meta.deletedAt);
            if (inserted.changes !== 1) throw new Error('No se ha podido crear un punto histórico.');
            taskIdsByExternalKey.set(task.externalKey, task.id);
            createdTaskCount += 1;
          }
        }

        let importedSessionCount = 0;
        for (const { session, parsed } of importableSessions) {
          const taskIds = session.taskExternalKeys.flatMap((externalKey) => {
            const id = taskIdsByExternalKey.get(externalKey);
            return id ? [id] : [];
          });
          if (taskIds.length !== session.taskExternalKeys.length) {
            throw new Error('No se han podido resolver todos los puntos de una sesión histórica. No se ha importado ningún cambio.');
          }
          const finalValue = JSON.stringify({
            ...parsed,
            items: taskIds,
            treatedTaskIds: taskIds,
            untreatedTaskIds: [],
          });
          const meta = recordMeta(finalValue);
          const duplicateId = db.prepare(`SELECT id FROM ${sessionTable} WHERE id = ?`).get(session.id) as { id?: unknown } | undefined;
          if (duplicateId) throw new Error('Una sesión histórica generada ya existe con el mismo identificador. Reintenta la importación.');
          const inserted = db.prepare(
            `INSERT INTO ${sessionTable} (id, value_json, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, ?, ?)`,
          ).run(session.id, finalValue, meta.createdAt, meta.updatedAt, meta.deletedAt);
          if (inserted.changes !== 1) throw new Error('No se ha podido crear una sesión histórica.');
          importedSessionCount += 1;
        }

        updateRefreshMetadata(db, new Date().toISOString());
        return {
          ok: true,
          status: currentStatus,
          message: 'Histórico de sesiones y puntos importado de forma atómica.',
          importedSessionCount,
          createdTaskCount,
        };
      })();
  return result;
}
