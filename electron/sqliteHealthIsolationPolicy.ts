/**
 * SQLite health check isolation policy.
 *
 * Production keeps the isolated read-only worker (blocking native SMB reads
 * must not monopolize Electron main). The test environment temporarily uses
 * its ALREADY OPEN main SQLite connection for routine health checks because
 * repeated isolated-worker timeouts were verified in the field. No additional
 * database handle is created. Integrity checks during recovery remain isolated.
 *
 * To diagnose the test worker, TRACCION_SQLITE_ISOLATED_HEALTH=1 forces it on.
 * This exception must be removed once the worker handshake/read is validated
 * on a real packaged Windows EXE.
 */
export function shouldUseIsolatedSqliteHealth(
  setting: string | undefined,
  environment: 'production' | 'test' = 'production',
): boolean {
  if (setting === '0') return false;
  if (setting === '1') return true;
  return environment !== 'test';
}
