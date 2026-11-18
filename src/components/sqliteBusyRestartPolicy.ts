// La condición de reinicio se comprueba tras la contención observada.
// Nunca desencadena un reinicio automático.
export const SQLITE_BUSY_RESTART_SUGGESTION_MS = 120_000;

export function shouldSuggestSqliteBusyRestart(
  busySinceAt: string | null,
  consecutiveBusy: number,
  now: number,
): boolean {
  if (!busySinceAt || consecutiveBusy < 3) return false;
  const started = Date.parse(busySinceAt);
  return Number.isFinite(started) && now - started >= SQLITE_BUSY_RESTART_SUGGESTION_MS;
}
