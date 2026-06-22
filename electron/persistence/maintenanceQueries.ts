import type { Database } from 'better-sqlite3';

// Nombres de día en inglés, estables y sin acentos/locale: el archivo de
// backup no depende del idioma del sistema operativo del usuario.
const DAILY_LOCAL_BACKUP_WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export const LOCAL_STORAGE_BACKUP_RETENTION_COUNT = 7;

export interface TableSizeBreakdownEntry {
  table: string;
  /** Tamaño aproximado en bytes. Si dbstat no está disponible, se estima a partir del número de filas. */
  sizeBytes: number;
  rowCount: number;
  /** false cuando el tamaño es una estimación por nº de filas, no una medida real de páginas SQLite. */
  isExactSize: boolean;
}

/**
 * Sin dependencias de Electron a propósito: este módulo solo contiene
 * lógica SQL pura que recibe un Database ya abierto, para que se pueda
 * probar con Vitest normal (proceso Node) sin necesitar el binario de
 * Electron instalado. Si una función necesita app.getPath, IPC, o locks de
 * fichero, no pertenece aquí — pertenece a sqlitePersistence.ts.
 */

export function pruneLocalStorageBackups(db: Database): void {
  db.prepare(
    `DELETE FROM local_storage_backups
     WHERE id NOT IN (
       SELECT id
       FROM local_storage_backups
       ORDER BY created_at DESC, id DESC
       LIMIT ?
     )`,
  ).run(LOCAL_STORAGE_BACKUP_RETENTION_COUNT);
}

export function listUserTableNames(db: Database): string[] {
  const rows = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    )
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

/**
 * Intento preciso: dbstat es una tabla virtual integrada en SQLite que
 * expone el tamaño real en páginas de cada tabla/índice. No siempre está
 * compilada en todas las distribuciones de better-sqlite3, así que si
 * falla, recurrimos a una estimación por nº de filas (menos exacta, pero
 * siempre disponible y suficiente para detectar qué tabla crece más).
 */
export function computeHeaviestTables(db: Database, limit = 8): TableSizeBreakdownEntry[] {
  const tableNames = listUserTableNames(db);
  if (tableNames.length === 0) {
    return [];
  }

  try {
    const rows = db
      .prepare('SELECT name, SUM(pgsize) AS sizeBytes FROM dbstat GROUP BY name')
      .all() as Array<{ name: string; sizeBytes: number }>;
    const sizeByTable = new Map(rows.map((row) => [row.name, row.sizeBytes]));

    const entries: TableSizeBreakdownEntry[] = tableNames.map((table) => {
      const rowCount = (db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number })
        .c;
      return {
        table,
        sizeBytes: sizeByTable.get(table) ?? 0,
        rowCount,
        isExactSize: true,
      };
    });
    return entries.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, limit);
  } catch {
    const entries: TableSizeBreakdownEntry[] = tableNames.map((table) => {
      const rowCount = (db.prepare(`SELECT COUNT(*) AS c FROM "${table}"`).get() as { c: number })
        .c;
      return { table, sizeBytes: 0, rowCount, isExactSize: false };
    });
    return entries.sort((a, b) => b.rowCount - a.rowCount).slice(0, limit);
  }
}

export function getDailyLocalBackupWeekdayName(date: Date): string {
  return DAILY_LOCAL_BACKUP_WEEKDAY_NAMES[date.getDay()];
}
