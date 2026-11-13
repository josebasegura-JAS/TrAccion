/**
 * PR9D · Control fail-closed de un único preflight read-only en proceso aislado.
 * Nunca resolver la operación hasta recibir exit: así no se reabre SQLite
 * mientras la verificación anterior pudiera seguir accediendo a SMB.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import {
  isSqliteIntegrityWorkerResponse,
  type SqliteIntegrityWorkerRequest,
} from './sqliteIntegrityWorkerProtocol.js';

export interface SqliteIntegrityChild {
  postMessage: (message: SqliteIntegrityWorkerRequest) => void;
  kill: () => void;
  onMessage: (callback: (message: unknown) => void) => void;
  onExit: (callback: (exitCode: number) => void) => void;
}

export interface SqliteIntegrityRunOptions {
  createChild: () => SqliteIntegrityChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  mode?: 'integrity' | 'health';
  timeoutMs?: number;
}

export function runSqliteIntegrityWorker(options: SqliteIntegrityRunOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Timeout inválido para el proceso SQLite aislado.'));
  }
  return new Promise<void>((resolve, reject) => {
    let child: SqliteIntegrityChild;
    try {
      child = options.createChild();
    } catch {
      reject(new Error('No se pudo crear el proceso SQLite de verificación.'));
      return;
    }
    let outcome: 'verified' | 'rejected' | 'timed-out' | 'send-error' | null = null;
    let dispatched = false;
    let exited = false;

    const askToStop = (): void => {
      try { child.postMessage({ kind: 'integrity:shutdown' }); }
      catch {
        // Si no se puede pedir un cierre normal, solicitar terminación.
        try { child.kill(); } catch { /* esperar exit o mantener pendiente */ }
      }
    };

    const timer = setTimeout(() => {
      if (exited) return;
      outcome = 'timed-out';
      // Solo hay lecturas: se puede terminar el proceso. No se da por
      // terminado hasta observar exit; así nunca se solapa con la reapertura.
      try { child.kill(); } catch { /* falla cerrado hasta exit */ }
    }, timeoutMs);
    timer.unref?.();

    child.onMessage((message) => {
      if (exited || outcome || !isSqliteIntegrityWorkerResponse(message)) return;
      if (message.kind === 'integrity:ready') {
        if (dispatched) return;
        dispatched = true;
        try {
          child.postMessage({
            kind: 'integrity:verify',
            databasePath: options.databasePath,
            expected: options.expected,
            ...(options.mode === 'health' ? { mode: 'health' as const } : {}),
          });
        } catch {
          outcome = 'send-error';
          try { child.kill(); } catch { /* esperar exit */ }
        }
        return;
      }
      if (!dispatched) return;
      outcome = message.kind === 'integrity:verified' ? 'verified' : 'rejected';
      askToStop();
    });

    child.onExit((exitCode) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (outcome === 'verified' && exitCode === 0) {
        resolve();
      } else {
        reject(new Error(outcome === 'timed-out'
          ? 'El proceso de verificación SQLite agotó el tiempo. Edición bloqueada hasta recuperación.'
          : 'No se ha podido verificar la integridad e identidad SQLite en un proceso aislado.'));
      }
    });
  });
}
