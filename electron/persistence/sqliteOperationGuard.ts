/**
 * Clasificación de errores de operaciones SQLite: decide si un error es
 * corrupción irrecuperable (hay que parar y avisar), contención temporal
 * (reintentar) u otra cosa (propagar tal cual). Usado por
 * `safeDatabaseOperation` en `sqlitePersistence.ts`, que envuelve
 * literalmente toda lectura/escritura de la base.
 *
 * Extraído a este módulo (que no importa 'electron') porque
 * `sqlitePersistence.ts` sí lo hace, y eso le impedía tener tests directos
 * con Vitest normal — mismo motivo por el que `sqliteConnection.ts`,
 * `schemaMigrations.ts`, etc. viven fuera del monolito. Ver
 * `docs/ARCHITECTURE.md` §10.
 */

export const SQLITE_BUSY_RETRY_DELAYS_MS = [100, 300, 700];

export function isSqliteCorruptionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('database disk image is malformed') ||
    message.includes('database corruption') ||
    message.includes('file is not a database')
  );
}

export function isSqliteLockContentionError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('base ocupada') || message.includes('bloqueo temporal');
}

export function isSqliteBusyOrLockedError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'SQLITE_BUSY' || code === 'SQLITE_LOCKED') {
      return true;
    }
  }

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('database is locked') || message.includes('database table is locked');
}
