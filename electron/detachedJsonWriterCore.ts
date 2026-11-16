/**
 * PR444 · Motor SQL de escrituras JSON en el proceso propietario de SQLite.
 *
 * NO usar desde Electron main mientras su conexión siga abierta. Un worker
 * solo puede invocarlo después de una cesión exclusiva y lock SMB confirmado.
 * Se aceptan únicamente tablas en la lista cerrada, nunca SQL arbitrario.
 */
import type { Database } from 'better-sqlite3';
import { isIsolatedJsonTable, type IsolatedJsonTable } from './persistence/isolatedJsonTables.js';

export interface DetachedJsonWrite {
  id: string;
  value: string;
  expectedUpdatedAt: string | null;
}

export type DetachedJsonWriteResult =
  | { ok: true; currentUpdatedAt: string }
  | { ok: false; conflict: true; currentUpdatedAt: string | null };

export type DetachedJsonBatchResult =
  | { ok: true; results: DetachedJsonWriteResult[] }
  | { ok: false; failedRecordId: string; currentUpdatedAt: string | null };

class BatchConflict extends Error {
  constructor(readonly id: string, readonly currentUpdatedAt: string | null) {
    super('Conflicto OCC de lote SQLite');
  }
}

function validatedRecord(record: DetachedJsonWrite): {
  createdAt: string; updatedAt: string; deletedAt: string | null;
} {
  if (!record || typeof record.id !== 'string' || !record.id.trim() ||
    typeof record.value !== 'string' || !record.value.trim() ||
    (record.expectedUpdatedAt !== null && typeof record.expectedUpdatedAt !== 'string')) {
    throw new Error('Solicitud de escritura JSON inválida.');
  }
  let obj: unknown;
  try { obj = JSON.parse(record.value); } catch { throw new Error('JSON inválido.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('El registro JSON debe ser un objeto.');
  }
  const value = obj as Record<string, unknown>;
  if (value.id !== record.id || typeof value.updatedAt !== 'string' || !value.updatedAt.trim()) {
    throw new Error('El ID y la revisión JSON deben corresponder al registro.');
  }
  if (record.expectedUpdatedAt !== null && record.expectedUpdatedAt === value.updatedAt) {
    throw new Error('La revisión nueva debe diferir de la esperada.');
  }
  return {
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : value.updatedAt,
    updatedAt: value.updatedAt,
    deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : null,
  };
}

function updatedAtFromRow(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const v = (row as { updated_at?: unknown }).updated_at;
  return typeof v === 'string' ? v : null;
}

function saveOne(
  db: Database, table: IsolatedJsonTable, record: DetachedJsonWrite,
): DetachedJsonWriteResult {
  const { createdAt, updatedAt, deletedAt } = validatedRecord(record);
  const existing = db.prepare(`SELECT updated_at, deleted_at FROM ${table} WHERE id = ?`)
    .get(record.id) as { updated_at: string; deleted_at: string | null } | undefined;
  const revision = existing?.updated_at ?? null;
  const canRestorePerson =
    table === 'ticket_restaurante_person_records' &&
    record.expectedUpdatedAt === null && revision !== null &&
    typeof existing?.deleted_at === 'string';
  if (revision !== record.expectedUpdatedAt && !canRestorePerson) {
    return { ok: false, conflict: true, currentUpdatedAt: revision };
  }
  if (canRestorePerson) {
    const result = db.prepare(
      `UPDATE ${table} SET value_json = ?, created_at = ?, updated_at = ?, deleted_at = NULL
       WHERE id = ? AND updated_at = ? AND deleted_at IS NOT NULL`,
    ).run(record.value, createdAt, updatedAt, record.id, revision);
    if (result.changes === 1) return { ok: true, currentUpdatedAt: updatedAt };
  } else if (revision === null) {
    const result = db.prepare(
      `INSERT OR IGNORE INTO ${table} (id, value_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(record.id, record.value, createdAt, updatedAt, deletedAt);
    if (result.changes === 1) return { ok: true, currentUpdatedAt: updatedAt };
  } else {
    const result = db.prepare(
      `UPDATE ${table} SET value_json = ?, updated_at = ?, deleted_at = ?
       WHERE id = ? AND updated_at = ?`,
    ).run(record.value, updatedAt, deletedAt, record.id, revision);
    if (result.changes === 1) return { ok: true, currentUpdatedAt: updatedAt };
  }
  const latest = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(record.id);
  return { ok: false, conflict: true, currentUpdatedAt: updatedAtFromRow(latest) };
}

/**
 * Un lote entero es atómico: ante un conflicto no se confirma ningún registro.
 * El caller adquiere el lock SMB y valida la propiedad ANTES de ejecutar esto.
 */
export function saveDetachedJsonBatch(
  db: Database, table: string, records: readonly DetachedJsonWrite[],
): DetachedJsonBatchResult {
  if (!isIsolatedJsonTable(table)) throw new Error('Tabla SQLite no autorizada para el escritor.');
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('El lote de escritura debe contener registros.');
  }
  const ids = new Set<string>();
  for (const record of records) {
    validatedRecord(record);
    if (ids.has(record.id)) throw new Error('El lote contiene identificadores duplicados.');
    ids.add(record.id);
  }
  try {
    const results = db.transaction(() => {
      const writes: DetachedJsonWriteResult[] = [];
      for (const record of records) {
        const result = saveOne(db, table, record);
        if (!result.ok) throw new BatchConflict(record.id, result.currentUpdatedAt);
        writes.push(result);
      }
      // Mantener la señal genérica de cambios usada por clientes antiguos.
      const last = records[records.length - 1];
      const time = JSON.parse(last.value).updatedAt as string;
      db.prepare(
        `INSERT INTO app_metadata (key, value, updated_at)
         VALUES ('persisted_records_refresh_token', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(`${time}:utilityProcess`, time);
      return writes;
    })();
    return { ok: true, results };
  } catch (error) {
    if (error instanceof BatchConflict) {
      return { ok: false, failedRecordId: error.id, currentUpdatedAt: error.currentUpdatedAt };
    }
    throw error;
  }
}
