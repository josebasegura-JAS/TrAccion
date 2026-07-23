/**
 * Cola de serialización para las operaciones IPC que tocan SQLite: garantiza
 * que solo se ejecuta una a la vez (evita colisiones de escritura concurrente
 * dentro del propio proceso principal). Extraído de main.ts porque lo usan
 * prácticamente todos los módulos (tareas, teletrabajo, actas, ticket
 * restaurante, etc.), así que necesita vivir en un sitio común que todos
 * puedan importar.
 *
 * Cada operación tiene además un límite de tiempo: la carpeta compartida
 * vive en una unidad de red (SMB), y una operación que toque el disco ahí
 * (por ejemplo, un `stat()` del tamaño de la base de datos) puede quedarse
 * colgada indefinidamente si la red falla en ese instante. Como la cola es
 * global y la usa toda la app, una sola operación colgada sin límite
 * bloquearía para siempre cualquier otra pantalla que necesite SQLite, no
 * solo la que la haya lanzado. Al agotarse el tiempo, la operación en curso
 * se abandona (puede seguir resolviéndose sola en segundo plano; no toca la
 * conexión de better-sqlite3 ni ningún lock, así que abandonarla es seguro)
 * y la cola sigue adelante con la siguiente operación pendiente.
 */
type QueuedIpcOperation<T> = () => T | Promise<T>;

const OPERATION_TIMEOUT_MS = 10_000;

let sqliteIpcQueue: Promise<unknown> = Promise.resolve();

function withTimeout<T>(promise: Promise<T>, ms: number, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[sqlite-ipc-queue] ${operationName} superó el límite de ${ms} ms y se ha cancelado.`));
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function enqueueSqliteIpc<T>(operationName: string, operation: QueuedIpcOperation<T>): Promise<Awaited<T>> {
  const startedAt = Date.now();
  const queuedOperation = sqliteIpcQueue.then(async (): Promise<Awaited<T>> => {
    const queuedMs = Date.now() - startedAt;
    if (queuedMs > 100) {
      console.warn(`[sqlite-ipc-queue] ${operationName} esperó ${queuedMs} ms en cola.`);
    }

    const operationStartedAt = Date.now();
    try {
      const result = await withTimeout(
        Promise.resolve().then(() => operation()),
        OPERATION_TIMEOUT_MS,
        operationName,
      );
      return result as Awaited<T>;
    } catch (error) {
      if (Date.now() - operationStartedAt >= OPERATION_TIMEOUT_MS) {
        console.error(
          `[sqlite-ipc-queue] ${operationName} se ha cancelado por tardar demasiado (posible problema de red); la cola continúa con el resto de operaciones.`,
        );
      }
      throw error;
    } finally {
      const operationMs = Date.now() - operationStartedAt;
      if (operationMs > 250 && operationMs < OPERATION_TIMEOUT_MS) {
        console.warn(`[sqlite-ipc-queue] ${operationName} tardó ${operationMs} ms.`);
      }
    }
  });

  sqliteIpcQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}
