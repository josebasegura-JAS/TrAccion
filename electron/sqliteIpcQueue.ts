import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Cola de serialización para las operaciones IPC que tocan SQLite: garantiza
 * que solo se ejecuta una a la vez dentro del propio proceso principal.
 *
 * La base vive habitualmente sobre SMB. El contexto AsyncLocalStorage permite
 * que la capa de persistencia sepa si la operación IPC actual es de solo
 * lectura. Las lecturas no necesitan competir por el lock externo `.lockdir`;
 * SQLite ya permite lectores concurrentes. Las escrituras y operaciones
 * críticas mantienen el lock exclusivo.
 */
type QueuedIpcOperation<T> = () => T | Promise<T>;

interface SqliteIpcOperationContext {
  operationName: string;
  readOnly: boolean;
}

const DEFAULT_OPERATION_TIMEOUT_MS = 12_000;
const STARTUP_OPERATION_TIMEOUT_MS = 30_000;
const RECOVERY_OPERATION_TIMEOUT_MS = 25_000;
const SLOW_NETWORK_WARNING_MS = 10_000;

const STARTUP_OPERATIONS = new Set([
  'database:load-persisted-records',
  'database:get-persisted-records-token',
  'database:get-persisted-record',
  'database:migrate-local-storage',
]);

const RECOVERY_OPERATIONS = new Set([
  'database:get-current-lock',
  'database:force-release-lock',
  'database:select-directory',
  'database:reset-directory',
]);

const EXPLICIT_READ_ONLY_OPERATIONS = new Set([
  'database:run-integrity-audit',
  'database:get-integrity-audit-summary',
  'tasks:refresh-open-word',
]);

const sqliteIpcContext = new AsyncLocalStorage<SqliteIpcOperationContext>();

let sqliteIpcQueue: Promise<unknown> = Promise.resolve();

export function isSqliteIpcReadOnlyOperation(operationName: string): boolean {
  if (EXPLICIT_READ_ONLY_OPERATIONS.has(operationName)) {
    return true;
  }

  // Convención de los handlers de TrAcción:
  //   * get/load/list/status => consulta
  //   * save/set/create/update/delete/migrate/restore/vacuum/... => escritura
  //
  // Ejemplos cubiertos:
  // database:get-persisted-records-token
  // tasks:load-records
  // plantilla:load-records
  // configuracion:load
  // database:list-local-backups
  return /(^|:)(get|load|list|status)(-|$)/.test(operationName);
}

export function isCurrentSqliteIpcReadOnly(): boolean {
  return sqliteIpcContext.getStore()?.readOnly === true;
}

export function getCurrentSqliteIpcOperationName(): string | null {
  return sqliteIpcContext.getStore()?.operationName ?? null;
}

export function resolveSqliteIpcTimeoutMs(operationName: string): number {
  if (STARTUP_OPERATIONS.has(operationName)) {
    return STARTUP_OPERATION_TIMEOUT_MS;
  }
  if (RECOVERY_OPERATIONS.has(operationName)) {
    return RECOVERY_OPERATION_TIMEOUT_MS;
  }
  return DEFAULT_OPERATION_TIMEOUT_MS;
}

function withTimeout<T>(promise: Promise<T>, ms: number, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      reject(
        new Error(
          `[sqlite-ipc-queue] ${operationName} superó el límite de ${ms} ms y se ha cancelado.`,
        ),
      );
    }, ms);

    const slowNetworkTimer =
      ms > SLOW_NETWORK_WARNING_MS
        ? setTimeout(() => {
            console.warn(
              `[sqlite-ipc-queue] ${operationName} lleva más de ${SLOW_NETWORK_WARNING_MS} ms. ` +
                'La conexión SMB parece lenta; TrAcción seguirá esperando antes de darla por fallida.',
            );
          }, SLOW_NETWORK_WARNING_MS)
        : null;

    const clearTimers = () => {
      clearTimeout(timeoutTimer);
      if (slowNetworkTimer) {
        clearTimeout(slowNetworkTimer);
      }
    };

    promise.then(
      (value) => {
        clearTimers();
        resolve(value);
      },
      (error) => {
        clearTimers();
        reject(error);
      },
    );
  });
}

export function enqueueSqliteIpc<T>(
  operationName: string,
  operation: QueuedIpcOperation<T>,
): Promise<Awaited<T>> {
  const startedAt = Date.now();
  const timeoutMs = resolveSqliteIpcTimeoutMs(operationName);
  const readOnly = isSqliteIpcReadOnlyOperation(operationName);

  const queuedOperation = sqliteIpcQueue.then(async (): Promise<Awaited<T>> => {
    const queuedMs = Date.now() - startedAt;
    if (queuedMs > 100) {
      console.warn(`[sqlite-ipc-queue] ${operationName} esperó ${queuedMs} ms en cola.`);
    }

    const operationStartedAt = Date.now();
    try {
      const result = await withTimeout(
        sqliteIpcContext.run(
          { operationName, readOnly },
          () => Promise.resolve().then(() => operation()),
        ),
        timeoutMs,
        operationName,
      );
      return result as Awaited<T>;
    } catch (error) {
      if (Date.now() - operationStartedAt >= timeoutMs) {
        console.error(
          `[sqlite-ipc-queue] ${operationName} se ha cancelado tras ${timeoutMs} ms ` +
            '(posible problema de red); la cola continúa con el resto de operaciones.',
        );
      }
      throw error;
    } finally {
      const operationMs = Date.now() - operationStartedAt;
      if (operationMs > 250 && operationMs < timeoutMs) {
        console.warn(`[sqlite-ipc-queue] ${operationName} tardó ${operationMs} ms.`);
      }
    }
  });

  sqliteIpcQueue = queuedOperation.catch(() => undefined);
  return queuedOperation;
}
