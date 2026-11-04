export interface LinkedTaskRetry {
  attempts: number;
  nextAt: number;
}

/** Esperas progresivas; nunca consultar cada render por un ID inexistente. */
export function nextLinkedTaskRetry(previous: LinkedTaskRetry | undefined, now: number): LinkedTaskRetry {
  const attempts = (previous?.attempts ?? 0) + 1;
  const delayMs = Math.min(30_000 * (2 ** Math.min(attempts - 1, 4)), 5 * 60_000);
  return { attempts, nextAt: now + delayMs };
}

/** IDs pendientes cuyo periodo de espera ha terminado. */
export function dueLinkedTaskIds(
  ids: readonly string[],
  inFlight: ReadonlySet<string>,
  retries: ReadonlyMap<string, LinkedTaskRetry>,
  now: number,
): string[] {
  return ids.filter((id) => !inFlight.has(id) && (retries.get(id)?.nextAt ?? 0) <= now);
}

/** Primera fecha de reintento para referencias aún ausentes. */
export function nextLinkedTaskRetryAt(
  ids: readonly string[],
  inFlight: ReadonlySet<string>,
  retries: ReadonlyMap<string, LinkedTaskRetry>,
  now: number,
): number | null {
  let nearest: number | null = null;
  for (const id of ids) {
    if (inFlight.has(id)) continue;
    const nextAt = retries.get(id)?.nextAt;
    if (nextAt === undefined || nextAt <= now) continue;
    if (nearest === null || nextAt < nearest) nearest = nextAt;
  }
  return nearest;
}
