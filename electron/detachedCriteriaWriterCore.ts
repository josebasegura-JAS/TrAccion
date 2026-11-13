/**
 * Primer guardado SQLite realmente ejecutable en un proceso distinto de main.
 * Solo admite Criterios RRLL; NO está conectado a los IPC de producción.
 * El consumidor debe haber cedido la propiedad exclusiva y el lock SMB antes
 * de usar este código contra una base real (todavía no implementado).
 */
import type { Database } from 'better-sqlite3';

export interface DetachedCriteriaSave {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export type DetachedCriteriaSaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: true; currentUpdatedAt: string | null };

function isUpdatedRow(value: unknown): value is { updated_at: string } {
  return !!value && typeof value === 'object' &&
    typeof (value as { updated_at?: unknown }).updated_at === 'string';
}

/**
 * OCC idéntico en principio a la ruta principal: alta solo si no existe;
 * edición solo si la revisión original sigue siendo la misma.
 * La sentencia y los valores son fijos; no admite SQL del renderer.
 */
export function saveDetachedCriteriaRecord(
  db: Database,
  record: DetachedCriteriaSave,
): DetachedCriteriaSaveResult {
  if (!record.id.trim() || !record.value.trim() ||
      (record.expectedUpdatedAt !== null && typeof record.expectedUpdatedAt !== 'string')) {
    throw new Error('Registro de Criterios RRLL inválido.');
  }
  const data: unknown = JSON.parse(record.value);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('El registro JSON debe ser un objeto.');
  }
  const object = data as Record<string, unknown>;
  if (object.id !== record.id || typeof object.updatedAt !== 'string' || !object.updatedAt) {
    throw new Error('Identidad o revisión del registro inválida.');
  }
  const updatedAt = object.updatedAt;
  const createdAt = typeof object.createdAt === 'string' ? object.createdAt : updatedAt;
  const deletedAt = typeof object.deletedAt === 'string' ? object.deletedAt : null;
  if (record.expectedUpdatedAt !== null && updatedAt === record.expectedUpdatedAt) {
    throw new Error('La nueva revisión no puede ser idéntica a la anterior.');
  }
  const table = 'criterios_rrll_records';
  return db.transaction((): DetachedCriteriaSaveResult => {
    const current = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(record.id);
    const currentUpdatedAt = isUpdatedRow(current) ? current.updated_at : null;
    if (currentUpdatedAt !== record.expectedUpdatedAt) {
      return { ok: false, conflict: true, currentUpdatedAt };
    }
    if (currentUpdatedAt === null) {
      const inserted = db.prepare(
        `INSERT OR IGNORE INTO ${table} (id, value_json, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?)`,
      ).run(record.id, record.value, createdAt, updatedAt, deletedAt);
      if (inserted.changes === 1) return { ok: true, updatedAt };
    } else {
      const changed = db.prepare(
        `UPDATE ${table} SET value_json = ?, updated_at = ?, deleted_at = ?
          WHERE id = ? AND updated_at = ?`,
      ).run(record.value, updatedAt, deletedAt, record.id, record.expectedUpdatedAt);
      if (changed.changes === 1) return { ok: true, updatedAt };
    }
    const latest = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(record.id);
    return {
      ok: false,
      conflict: true,
      currentUpdatedAt: isUpdatedRow(latest) ? latest.updated_at : null,
    };
  })();
}
