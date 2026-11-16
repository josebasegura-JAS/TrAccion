/** Transacción única de Presupuestos. El caller retiene la propiedad SQLite y el lock SMB.
 * Comprueba OCC dentro de la transacción para evitar la ventana entre load y save.
 */
import type { Database } from 'better-sqlite3';
import type { DatabaseStatus } from '../sqlitePersistence.js';
import type { SimpleJsonSaveResult } from './simpleJsonModuleRepository.js';
import type { PresupuestosSnapshotInput } from './presupuestosRepository.js';
import { readActiveJsonRecords } from './jsonRecordRepository.js';

const TABLES = [
  ['presupuesto_scenario_records','scenarios'],
  ['presupuesto_manual_item_records','manualItems'],
  ['presupuesto_ticket_group_records','ticketGroups'],
  ['presupuesto_actual_records','actuals'],
] as const;

/** Misma revisión que la lectura productiva: el máximo de filas activas
 * de las cuatro colecciones, sin incluir registros borrados lógicamente. */
export function readPresupuestosActiveRevision(db: Database): string | null {
  let latest: string | null = null;
  for (const [table] of TABLES) {
    const row = db.prepare(
      `SELECT MAX(updated_at) AS updated_at FROM ${table} WHERE deleted_at IS NULL`,
    ).get() as { updated_at?: unknown } | undefined;
    if (typeof row?.updated_at === 'string' && (latest === null || row.updated_at > latest)) {
      latest = row.updated_at;
    }
  }
  return latest;
}

/** Returns conflict without altering any collection; throws on SQL failure (rollback).
 * Refresh metadata is part of the same SQLite transaction.
 */
export function savePresupuestosTransaction(
  db: Database,
  snapshot: PresupuestosSnapshotInput,
  status: DatabaseStatus,
  updateRefreshMetadata: (db: Database, updatedAt: string) => void,
): SimpleJsonSaveResult {
  if (!snapshot || (snapshot.expectedUpdatedAt !== null &&
      typeof snapshot.expectedUpdatedAt !== 'string')) {
    throw new Error('Revisión de Presupuestos inválida.');
  }
  for (const [, key] of TABLES) {
    const rows = snapshot[key];
    if (!Array.isArray(rows) || rows.length > 10000) throw new Error('Colección de Presupuestos inválida.');
    const ids = new Set<string>();
    for (const record of rows) {
      if (!record || typeof record.id !== 'string' || !record.id.trim() ||
          typeof record.value !== 'string' || ids.has(record.id)) {
        throw new Error('Registro de Presupuestos inválido o duplicado.');
      }
      ids.add(record.id);
    }
  }
  return db.transaction((): SimpleJsonSaveResult => {
    const currentUpdatedAt = readPresupuestosActiveRevision(db);
    if (currentUpdatedAt !== snapshot.expectedUpdatedAt) {
      return {
        ok: false, status, currentUpdatedAt,
        message: 'Presupuestos ha sido modificado por otro usuario. Recarga antes de guardar.',
      };
    }
    const updatedAt = new Date().toISOString();
    for (const [tableName, key] of TABLES) {
      const records = snapshot[key];
      const ids = new Set(records.map(record => record.id));
      for (const row of readActiveJsonRecords(db, tableName)) {
        if (!ids.has(row.id)) {
          db.prepare(`UPDATE ${tableName} SET updated_at = ?, deleted_at = ? WHERE id = ?`)
            .run(updatedAt, updatedAt, row.id);
        }
      }
      const upsert = db.prepare(
        `INSERT INTO ${tableName} (id, value_json, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(id) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at,
           deleted_at = NULL`,
      );
      for (const record of records) {
        upsert.run(record.id, record.value, updatedAt, updatedAt);
      }
    }
    updateRefreshMetadata(db, updatedAt);
    return {
      ok: true, status, currentUpdatedAt: updatedAt,
      message: 'Presupuestos guardado en SQLite.',
    };
  })();
}
