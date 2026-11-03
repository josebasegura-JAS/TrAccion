/**
 * Cola exclusiva de exportaciones Excel dentro de este proceso Electron.
 * Cada trabajo obtiene su snapshot al comenzar; así ninguna exportación
 * anterior puede sobrescribir a otra más reciente del mismo proceso.
 *
 * Esta cola es independiente de la cola IPC de SQLite. La preparación debe
 * consultar SQLite mediante enqueueSqliteIpc, pero la escritura Excel no.
 */
export function createSerialTaskExcelQueue(): {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
} {
  let tail: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(operation: () => Promise<T>): Promise<T> {
      const result = tail.then(operation);
      // Un error de exportación no bloquea las solicitudes posteriores.
      tail = result.then(() => undefined, () => undefined);
      return result;
    },
  };
}
