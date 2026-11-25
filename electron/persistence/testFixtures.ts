import Database from 'better-sqlite3';
import { applyMigrations } from './schemaMigrations.js';

/**
 * Exclusivamente para fixtures que requieren una base vacía ya migrada.
 * Cada llamada crea su propio archivo; nunca reutiliza datos ni identidad.
 * Las pruebas de migración, apertura, recuperación y durabilidad conservan
 * sus rutas reales. Agrupar DDL en una transacción evita decenas de fsync.
 */
export function createMigratedTestFixture(file: string): void {
  const db = new Database(file);
  try {
    db.transaction(() => applyMigrations(db))();
  } finally {
    db.close();
  }
}
