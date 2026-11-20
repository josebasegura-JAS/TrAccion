/**
 * La comprobación de salud NO es una escritura. Si el esquema está bloqueado
 * no debe aplicar el busy_timeout de 15 s de las operaciones de negocio:
 * una consulta síncrona prolongada inmoviliza el hilo principal de Electron.
 *
 * No se cierra ni se vuelve a abrir SQLite por SQLITE_BUSY: no demuestra un
 * error de E/S y podría haber un backup/transacción todavía activa.
 */
import type { Database } from 'better-sqlite3';

export const SQLITE_HEALTH_BUSY_TIMEOUT_MS = 750;
export const SQLITE_HEALTH_BUSY_FAILURE_THRESHOLD = 3;
export const SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS = 90_000;
export const SQLITE_HEALTH_BUSY_STATUS_MESSAGE =
  'SQLite continúa ocupada tras varias comprobaciones. Edición suspendida hasta verificar de nuevo la conexión; no repitas guardados de resultado incierto.';

/**
 * El PRAGMA pertenece a la conexión y se restaura antes de devolver control
 * al event loop. Nunca envolver acciones asíncronas con este método.
 */
export function withTemporarySqliteBusyTimeout<T>(
  db: Pick<Database, 'pragma'>,
  busyTimeoutMs: number,
  operation: () => T,
): T {
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0) {
    throw new Error('Timeout de health-check SQLite inválido.');
  }
  // Los tipos nativos del proyecto declaran pragma(source) (sin segunda
  // opción). SQLite devuelve [{ timeout: N }] para PRAGMA busy_timeout.
  const rows: unknown = db.pragma('busy_timeout');
  const first = Array.isArray(rows) ? rows[0] as { timeout?: unknown } | undefined : undefined;
  const originalTimeout = first?.timeout;
  if (typeof originalTimeout !== 'number' || !Number.isSafeInteger(originalTimeout)) {
    throw new Error('No se pudo consultar el busy_timeout original de SQLite.');
  }
  db.pragma(`busy_timeout = ${busyTimeoutMs}`);
  try {
    return operation();
  } finally {
    db.pragma(`busy_timeout = ${originalTimeout}`);
  }
}

export function createSqliteHealthBusyTracker(
  threshold = SQLITE_HEALTH_BUSY_FAILURE_THRESHOLD,
  probeIntervalMs = SQLITE_HEALTH_BUSY_PROBE_INTERVAL_MS,
) {
  let failures = 0;
  let lastBusyAt = 0;

  return {
    isDegraded: () => failures >= threshold,
    consecutiveFailures: () => failures,
    shouldProbe: (now: number) =>
      failures < threshold || now - lastBusyAt >= probeIntervalMs,
    observeBusy: (now: number) => {
      failures = Math.min(failures + 1, threshold);
      lastBusyAt = now;
      return failures >= threshold;
    },
    reset: () => {
      failures = 0;
      lastBusyAt = 0;
    },
  };
}
