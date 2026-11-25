/**
 * Transporte de operaciones de alto nivel. No admite SQL arbitrario.
 * Una sola operación en vuelo; un timeout deja el resultado incierto y
 * bloquea el canal hasta que el propietario confirme la salida del proceso.
 */
export interface SqliteEngineRequest {
  kind: 'engine:request';
  id: number;
  operation: string;
  args: unknown[];
}

export type SqliteEngineResponse =
  | { kind: 'engine:result'; id: number; value: unknown }
  | { kind: 'engine:error'; id: number; message: string };

function isMessage(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isEngineRequest(value: unknown): value is SqliteEngineRequest {
  return isMessage(value) && value.kind === 'engine:request' && isId(value.id)
    && typeof value.operation === 'string' && value.operation.length > 0
    && Array.isArray(value.args);
}

export function isEngineResponse(value: unknown): value is SqliteEngineResponse {
  return isMessage(value) && isId(value.id) && (
    (value.kind === 'engine:result' && 'value' in value)
    || (value.kind === 'engine:error' && typeof value.message === 'string')
  );
}

export type EngineOperation = (...args: unknown[]) => unknown;

export function createEngineDispatcher(operations: ReadonlyMap<string, EngineOperation>) {
  let busy = false;
  return async (request: unknown): Promise<SqliteEngineResponse | undefined> => {
    if (!isEngineRequest(request)) return undefined;
    const { id, operation, args } = request;
    const handler = operations.get(operation);
    if (!handler || busy) {
      return { kind: 'engine:error', id, message: busy ? 'Motor ocupado' : 'Operación no autorizada' };
    }
    busy = true;
    try {
      return { kind: 'engine:result', id, value: await handler(...args) };
    } catch (error) {
      return { kind: 'engine:error', id, message: error instanceof Error ? error.message : String(error) };
    } finally {
      busy = false;
    }
  };
}

export type EngineChannelState = 'idle' | 'busy' | 'uncertain' | 'exited';

export interface EngineTransport {
  postMessage(request: SqliteEngineRequest): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
}

export function createEngineClient(transport: EngineTransport) {
  let state: EngineChannelState = 'idle';
  let sequence = 0;
  let pending: {
    id: number;
    timer: ReturnType<typeof setTimeout>;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  } | null = null;

  function takePending() {
    const current = pending;
    pending = null;
    if (current) clearTimeout(current.timer);
    return current;
  }

  transport.onMessage((message) => {
    if (!isEngineResponse(message) || state !== 'busy' || pending?.id !== message.id) return;
    const current = takePending();
    state = 'idle';
    if (message.kind === 'engine:result') current?.resolve(message.value);
    else current?.reject(new Error(message.message));
  });

  transport.onExit(() => {
    state = 'exited';
    takePending()?.reject(new Error('El proceso SQLite ha salido; resultado de la operación no confirmado.'));
  });

  return {
    getState: (): EngineChannelState => state,
    call(operation: string, args: unknown[] = [], timeoutMs = 30_000): Promise<unknown> {
      if (state !== 'idle') return Promise.reject(new Error(`Canal SQLite no disponible: ${state}`));
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
        return Promise.reject(new Error('Tiempo de espera inválido.'));
      }
      if (!operation) return Promise.reject(new Error('Operación vacía.'));
      const id = ++sequence;
      state = 'busy';
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          state = 'uncertain';
          takePending()?.reject(new Error('Tiempo de espera agotado; resultado SQLite no confirmado.'));
        }, timeoutMs);
        pending = { id, timer, resolve, reject };
        try {
          transport.postMessage({ kind: 'engine:request', id, operation, args });
        } catch {
          // No es posible demostrar que el mensaje nunca llegó al otro proceso.
          state = 'uncertain';
          takePending()?.reject(new Error('Envío SQLite fallido; resultado no confirmado.'));
        }
      });
    },
  };
}
