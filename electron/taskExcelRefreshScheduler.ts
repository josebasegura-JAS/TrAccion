/**
 * Agrupa disparos de mantenimiento en segundo plano sin permitir dos
 * ejecuciones simultáneas. Los cambios recibidos durante una exportación
 * obligan a ejecutar una actualización adicional al terminar.
 */
export function createDebouncedSerialRefresh(
  work: () => Promise<void>,
  onError: (error: unknown) => void,
  delayMs: number,
): { schedule: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;

  function arm(): void {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { void run(); }, delayMs);
  }

  async function run(): Promise<void> {
    timer = null;
    if (inFlight || !dirty) return;
    dirty = false;
    inFlight = true;
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
      // Si se modificó otra tarea mientras se generaba el Excel, no perdemos
      // ese cambio ni encolamos varias exportaciones idénticas.
      if (dirty && timer === null) arm();
    }
  }

  return {
    schedule(): void {
      dirty = true;
      arm();
    },
  };
}
