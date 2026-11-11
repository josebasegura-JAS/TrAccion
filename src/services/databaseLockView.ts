/**
 * Formatea la antigüedad de un lock SQLite (su `updatedAt`) de forma legible
 * para mostrar en Ajustes, p. ej. "hace 45 s" o "hace 12 min". Pensado para
 * que un admin pueda decidir con criterio si un bloqueo "lleva demasiado" y
 * conviene forzar su liberación manual.
 */
export function formatLockAge(updatedAt: string): string {
  const updatedAtMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedAtMs)) {
    return 'antigüedad desconocida';
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - updatedAtMs) / 1000));
  if (ageSeconds < 60) {
    return `hace ${ageSeconds} s`;
  }

  const ageMinutes = Math.round(ageSeconds / 60);
  if (ageMinutes < 60) {
    return `hace ${ageMinutes} min`;
  }

  const ageHours = Math.round(ageMinutes / 60);
  return `hace ${ageHours} h`;
}


/** Margen para pequeñas diferencias horarias y el tiempo de propagación SMB. */
export const LOCK_CLOCK_FUTURE_TOLERANCE_MS = 5_000;

/**
 * Solo detecta una marca del OTRO equipo en el futuro o inválida.
 * No certifica sincronización: un PC local adelantado no se puede identificar
 * de forma fiable con esta observación y requiere comprobación horaria externa.
 */
export function getLockClockWarning(updatedAt: string, nowMs = Date.now()): string | null {
  const remoteMs = Date.parse(updatedAt);
  if (!Number.isFinite(remoteMs)) {
    return 'La fecha del bloqueo es inválida. No fuerces la liberación: comprueba los relojes y el estado de la red.';
  }

  const futureMs = remoteMs - nowMs;
  if (futureMs <= LOCK_CLOCK_FUTURE_TOLERANCE_MS) return null;

  const seconds = Math.ceil(futureMs / 1000);
  return `El bloqueo indica una hora ${seconds} s posterior a la de este equipo. Puede existir un desfase horario entre equipos. No fuerces la liberación; verifica la sincronización horaria y que el otro equipo no esté trabajando.`;
}
