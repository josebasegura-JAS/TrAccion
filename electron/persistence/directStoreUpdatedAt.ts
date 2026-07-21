import type { Database } from 'better-sqlite3';

/**
 * Módulos con tabla propia (patrón `createJsonModuleRepository`) cuya tabla
 * se consulta directamente en cada ciclo de polling (`getPersistedRecordsTokenSnapshot`,
 * cada ~12s desde `externalDataSync.ts`) para saber si otro usuario ha
 * cambiado algo — sin esta entrada, el polling multiusuario nunca detecta
 * cambios de ese módulo y el resto de usuarios no ven la actualización hasta
 * recargar la app entera.
 *
 * Alternativa histórica: algunos módulos (Presupuestos, Criterios RRLL,
 * Ticket Restaurante, Vinculograma, Actas-tipos) se detectan en su lugar vía
 * escritura espejo al layer genérico `persisted_records` (`writeStorageItem`
 * en el frontend) — funciona, pero cuesta una escritura extra por guardado y
 * es fácil de olvidar al crear un módulo nuevo. Añadir aquí la tabla real es
 * más barato (una sola consulta `MAX(updated_at)`, sin escritura extra) y no
 * depende de que nadie recuerde añadir el mirror-write en el store.
 *
 * Si añades un `<modulo>SqliteRepository.ts` nuevo con tabla propia,
 * añádelo aquí — o confirma explícitamente que ya tiene el mirror-write
 * (`grep writeStorageItem` en su store) — para que el polling lo detecte.
 */
export const DIRECT_STORE_UPDATED_AT_TABLES: Record<string, string> = {
  plantilla: 'employee_records',
  teletrabajo: 'teletrabajo_solicitud_records',
  actas: 'acta_records',
  'comite-sesiones': 'comite_session_records',
  'paritaria-sesiones': 'paritaria_session_records',
  tareas: 'task_records',
  sorteos: 'sorteos_draw_records',
  'licencias-sin-sueldo': 'licencia_sin_sueldo_records',
  especiales: 'especiales_recipient_records',
};

interface UpdatedAtRow {
  updated_at: string;
}

function isUpdatedAtRow(value: unknown): value is UpdatedAtRow {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { updated_at?: unknown }).updated_at === 'string'
  );
}

export function getJsonRecordTableUpdatedAt(db: Database, tableName: string): string | null {
  const row = db.prepare(`SELECT MAX(updated_at) AS updated_at FROM ${tableName}`).get();
  return isUpdatedAtRow(row) ? row.updated_at : null;
}

export function getDirectStoreUpdatedAtSnapshot(db: Database): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(DIRECT_STORE_UPDATED_AT_TABLES).map(([storeId, tableName]) => [
      storeId,
      getJsonRecordTableUpdatedAt(db, tableName),
    ]),
  );
}
