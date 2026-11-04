/**
 * Agrupa los cambios de Tareas, con un plazo máximo desde el primer cambio.
 * No solapa generaciones; si aparecen cambios durante el trabajo, hace otra
 * pasada después del tiempo de espera, sin bloquear el guardado SQLite.
 */
export function createDebouncedSerialRefresh(
  work: () => Promise<void>,
  onError: (error: unknown) => void,
  delayMs: number,
  maxWaitMs = Number.POSITIVE_INFINITY,
): { schedule: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;
  let firstDirtyAt: number | null = null;

  function arm(): void {
    if (timer !== null) clearTimeout(timer);
    const remaining = firstDirtyAt === null ? delayMs : Math.max(0, maxWaitMs - (Date.now() - firstDirtyAt));
    const nextDelay = Math.min(delayMs, remaining);
    timer = setTimeout(() => { void run(); }, nextDelay);
    timer.unref?.();
  }

  async function run(): Promise<void> {
    timer = null;
    if (inFlight || !dirty) return;
    dirty = false;
    firstDirtyAt = null;
    inFlight = true;
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
      // No perder cambios producidos durante un Excel lento.
      if (dirty && timer === null) arm();
    }
  }

  return {
    schedule(): void {
      if (!dirty) firstDirtyAt = Date.now();
      dirty = true;
      arm();
    },
  };
}
