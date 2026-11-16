/**
 * Cola estrictamente serial del protocolo del escritor SQLite aislado.
 * Cada petición termina (incluido cualquier await) antes de procesar la siguiente.
 * Un fallo inesperado es fatal: no se admite más trabajo ni se interpreta
 * una respuesta anterior como confirmación de un guardado posterior.
 */
export function createSerializedDetachedMessageQueue<T>(
  handle: (message: T) => void | Promise<void>,
  onFatal: (error: unknown) => void,
) {
  let tail: Promise<void> = Promise.resolve();
  let failed = false;
  return {
    enqueue(message: T): void {
      if (failed) return;
      tail = tail.then(async () => {
        if (failed) return;
        await handle(message);
      }).catch((error: unknown) => {
        if (failed) return;
        failed = true;
        onFatal(error);
      });
    },
    whenIdle(): Promise<void> {
      return tail;
    },
    get failed(): boolean {
      return failed;
    },
  };
}
