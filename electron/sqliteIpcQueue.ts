/**
 * Cola de serialización para las operaciones IPC que tocan SQLite: garantiza
 * que solo se ejecuta una a la vez (evita colisiones de escritura concurrente
 * dentro del propio proceso principal). Extraído de main.ts porque lo usan
 * prácticamente todos los módulos (tareas, teletrabajo, actas, ticket
 * restaurante, etc.), así que necesita vivir en un sitio común que todos
 * puedan importar.
 */
type QueuedIpcOperation<T> = () => T | Promise<T>;

let sqliteIpcQueue: Promise<unknown> = Promise.resolve();

export function enqueueSqliteIpc<T>(operationName: string, operation: QueuedIpcOperation<T>): Promise<Awaited<T>> {
  const startedAt = Date.now();
  const queuedOperation = sqliteIpcQueue.then(async (): Promise<Awaited<T>> => {
    const queuedMs = Date.now() - startedAt;
    if (queuedMs > 100) {
      console.warn(`[sqlite-ipc-queue] ${operationName} esperó ${queuedMs} ms en cola.`);
    }

    const operationStartedAt = Date.now();
    try {
      return (await operation()) as Awaited<T>;
    } finally {
      const operationMs = Date.now() - operationStartedAt;
      if (operationMs > 250) {
        console.warn(`[sqlite-ipc-queue] ${operationName} tardó ${operationMs} ms.`);
      }
    }
  });

  sqliteIpcQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}
