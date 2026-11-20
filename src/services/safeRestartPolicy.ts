// Solo se solicita una vez por episodio de indisponibilidad; la decisión
// final es del proceso principal, que revisa E/S, backups y cambios sin guardar.
export const AUTOMATIC_RESTART_AFTER_MS = 5 * 60_000;
export const RESTART_SUGGESTION_AFTER_MS = 2 * 60_000;

export function isAutomaticRestartDue(unavailableSinceAt: string | null, now: number): boolean {
  if (!unavailableSinceAt) return false;
  const time = Date.parse(unavailableSinceAt);
  return Number.isFinite(time) && now >= time &&
    now - time >= AUTOMATIC_RESTART_AFTER_MS;
}

export function shouldSuggestSupervisedRestart(unavailableSinceAt: string | null, now: number): boolean {
  if (!unavailableSinceAt) return false;
  const time = Date.parse(unavailableSinceAt);
  return Number.isFinite(time) && now >= time &&
    now - time >= RESTART_SUGGESTION_AFTER_MS;
}
