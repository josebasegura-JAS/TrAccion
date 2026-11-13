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


/**
 * Los errores de E/S de SQLite no son contención: reintentar la misma
 * sentencia (especialmente una escritura) puede duplicar sus efectos.
 * Reconocer el código extendido SQLITE_IOERR_* y el mensaje de better-sqlite3.
 */
export function isSqliteIoError(error: unknown): boolean {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '').toUpperCase()
    : '';
  if (code === 'SQLITE_IOERR' || code.startsWith('SQLITE_IOERR_')) {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('disk i/o error') || message.includes('disk io error');
}

/**
 * PR9B · Solo para fallos del stat del fichero en el health-check.
 * NO aplicar este criterio a escrituras: UNKNOWN de Win32 no demuestra si una
 * transacción llegó a completarse, y nunca debe reintentarse por este motivo.
 */
export function isRecoverableSqliteHealthFileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; syscall?: unknown };
  const code = typeof candidate.code === 'string' ? candidate.code.toUpperCase() : '';
  const syscall = typeof candidate.syscall === 'string' ? candidate.syscall.toLowerCase() : '';
  if (syscall !== 'stat' && syscall !== 'lstat') return false;
  return [
    'UNKNOWN', 'EIO', 'ETIMEDOUT', 'ENOTCONN', 'ENETDOWN',
    'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH', 'ECONNRESET', 'ESTALE',
  ].includes(code);
}

/** Tres fallos de acceso de red consecutivos antes de solicitar reapertura.
 * Se resetea al recibir cualquier resultado del stat que no sea uno de ellos
 * o cuando el health-check termina correctamente.
 */
export function createSqliteHealthFileFailureTracker(threshold = 3) {
  let failures = 0;
  return {
    observe(error: unknown): boolean {
      if (!isRecoverableSqliteHealthFileError(error)) {
        failures = 0;
        return false;
      }
      failures += 1;
      return failures >= threshold;
    },
    reset(): void { failures = 0; },
    count(): number { return failures; },
  };
}
