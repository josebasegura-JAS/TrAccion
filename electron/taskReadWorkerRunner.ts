/**
 * PR9D-4A · Un único read request por utilityProcess.
 * Las respuestas solo se entregan tras confirmar exit; el timeout nunca
 * desbloquea otra operación ni abre un proceso sustituto mientras el anterior
 * podría seguir vivo sobre SMB.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteTaskRecord, SqliteTaskRecordsFilter } from './persistence/taskRepository.js';
import { isTaskReadWorkerResponse, type TaskReadWorkerRequest } from './taskReadWorkerProtocol.js';

export interface TaskReadChild {
  postMessage(message: TaskReadWorkerRequest): void;
  kill(): void;
  onMessage(listener: (message: unknown) => void): void;
  onExit(listener: (code: number) => void): void;
}
export interface TaskReadOptions {
  createChild: () => TaskReadChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  filter: SqliteTaskRecordsFilter;
  timeoutMs?: number;
}

export function runTaskReadWorker(options: TaskReadOptions): Promise<SqliteTaskRecord[]> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return Promise.reject(new Error('Timeout de Tareas inválido.'));
  return new Promise((resolve, reject) => {
    let child: TaskReadChild;
    try { child = options.createChild(); }
    catch { reject(new Error('No se pudo iniciar el lector de Tareas.')); return; }
    let sent = false;
    let outcome: 'ok' | 'error' | 'timeout' | null = null;
    let result: SqliteTaskRecord[] | null = null;
    let exited = false;
    const kill = () => { try { child.kill(); } catch { /* bloquear hasta exit */ } };
    const timer = setTimeout(() => {
      if (exited || outcome) return;
      outcome = 'timeout';
      kill();
    }, timeoutMs);
    timer.unref?.();

    child.onMessage((data) => {
      if (exited || outcome || !isTaskReadWorkerResponse(data)) return;
      if (data.kind === 'tasks:ready') {
        if (sent) return;
        sent = true;
        try {
          child.postMessage({
            kind: 'tasks:read', databasePath: options.databasePath,
            expected: options.expected, filter: options.filter,
          });
        } catch { outcome = 'error'; kill(); }
        return;
      }
      if (!sent) return;
      if (data.kind === 'tasks:result') {
        result = data.records;
        outcome = 'ok';
      } else {
        outcome = 'error';
      }
      try { child.postMessage({ kind: 'tasks:shutdown' }); } catch { kill(); }
    });
    child.onExit((code) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (outcome === 'ok' && code === 0 && result !== null) resolve(result);
      else reject(new Error(outcome === 'timeout'
        ? 'Lector SQLite de Tareas sin respuesta; operación bloqueada hasta confirmar salida.'
        : 'No se ha podido leer Tareas desde el proceso auxiliar.'));
    });
  });
}
