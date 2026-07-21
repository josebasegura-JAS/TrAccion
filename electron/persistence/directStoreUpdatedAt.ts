import type { Database } from 'better-sqlite3';

/**
 * Módulos con tabla propia (patrón `createJsonModuleRepository`) cuya tabla
 * se consulta directamente en cada ciclo de polling (`getPersistedRecordsTokenSnapshot`,
 * cada ~12s desde `externalDataSync.ts`) para saber si otro usuario ha
 * cambiado algo — sin esta entrada, el polling multiusuario nunca detecta
 * cambios de ese módulo y el resto de usuarios no ven la actualización hasta
 * recargar la app entera.
 *
 * Alternativa histórica: algunos módulos se detectan en su lugar vía
 * escritura espejo al layer genérico `persisted_records` (`writeStorageItem`
 * en el frontend). Es más frágil de lo que parece: solo funciona si el
 * mirror-write se ejecuta en el camino de ÉXITO real (el que usa
 * `xWithConcurrencyCheck` cuando SQLite está disponible), no solo en el
 * `else` de fallback para cuando SQLite no está disponible. Julio de 2026:
 * se encontró que Criterios RRLL, Ticket Restaurante, Vinculograma, tipos de
 * Acta y Configuración tenían el mirror-write únicamente en el fallback —
 * es decir, nunca se ejecutaba en un despliegue normal con SQLite activo, y
 * el polling llevaba tiempo sin detectar sus cambios. Confirmado que sí
 * funciona correctamente (mirror incondicional, no solo en el fallback) en
 * Presupuestos y en Teletrabajo (puestos/grupos de cobertura). Ver
 * docs/DECISIONS.md para el detalle módulo a módulo.
 *
 * Por eso la entrada aquí (una consulta `MAX(updated_at)` indexada, sin
 * escritura extra) es la opción más robusta: no depende de acordarse de
 * mantener vivo un mirror-write en cada punto de guardado nuevo.
 *
 * Si añades un `<modulo>SqliteRepository.ts` nuevo con tabla propia,
 * añádelo aquí en vez de confiar en un mirror-write al layer genérico.
 */
export const DIRECT_STORE_UPDATED_AT_TABLES: Record<string, string | string[]> = {
  plantilla: 'employee_records',
  teletrabajo: 'teletrabajo_solicitud_records',
  // acta_type_records comparte storeId con acta_records: 'actas' ya está
  // registrado en syncableStoreRegistrations.ts y su reloadFromStorage
  // recarga ambos (ver loadActasStateFromSqliteOrStorage).
  actas: ['acta_records', 'acta_type_records'],
  'comite-sesiones': 'comite_session_records',
  'paritaria-sesiones': 'paritaria_session_records',
  tareas: 'task_records',
  sorteos: 'sorteos_draw_records',
  'licencias-sin-sueldo': 'licencia_sin_sueldo_records',
  especiales: 'especiales_recipient_records',
  'criterios-rrll': 'criterios_rrll_records',
  vinculograma: 'vinculograma_records',
  configuracion: 'configuracion_state',
  // Ticket Restaurante es un único storeId (registrado así en
  // syncableStoreRegistrations.ts) sobre 5 tablas físicas independientes:
  // cualquiera de las 5 debe disparar la recarga.
  'ticket-restaurante': [
    'ticket_restaurante_calendar_records',
    'ticket_restaurante_person_records',
    'ticket_restaurante_absence_records',
    'ticket_restaurante_config_records',
    'ticket_restaurante_manutencion_records',
  ],
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

function latestOf(values: Array<string | null>): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) {
      return latest;
    }
    if (!latest || Date.parse(value) > Date.parse(latest)) {
      return value;
    }
    return latest;
  }, null);
}

export function getDirectStoreUpdatedAtSnapshot(db: Database): Record<string, string | null> {
  return Object.fromEntries(
    Object.entries(DIRECT_STORE_UPDATED_AT_TABLES).map(([storeId, tableNames]) => {
      const tables = Array.isArray(tableNames) ? tableNames : [tableNames];
      return [storeId, latestOf(tables.map((tableName) => getJsonRecordTableUpdatedAt(db, tableName)))];
    }),
  );
}
