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
