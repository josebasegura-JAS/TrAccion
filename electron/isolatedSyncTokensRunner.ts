/**
 * Solo se libera la reserva al observar exit. Un timeout nunca da por
 * terminada la E/S nativa aunque ya se haya solicitado kill().
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { IsolatedSyncTokens } from './isolatedSyncTokensCore.js';
import {
  isSyncTokensResponse,
  type SyncTokensRequest,
} from './isolatedSyncTokensProtocol.js';

export interface SyncTokensChild {
  postMessage(message: SyncTokensRequest): void;
  kill(): void;
  onMessage(handler: (message: unknown) => void): void;
  onExit(handler: (exitCode: number) => void): void;
}

export function runIsolatedSyncTokens(options: {
  createChild: () => SyncTokensChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  timeoutMs?: number;
}): Promise<IsolatedSyncTokens> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!options.databasePath.trim() || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Parámetros de lectura SQLite inválidos.'));
  }

  return new Promise((resolve, reject) => {
    let child: SyncTokensChild;
    try { child = options.createChild(); }
    catch { reject(new Error('No se pudo iniciar el lector de sincronización.')); return; }

    let dispatched = false;
    let result: IsolatedSyncTokens | null = null;
    let outcome: 'ok' | 'failure' | 'timeout' | null = null;
    let exited = false;
    let stopping = false;
    const kill = () => {
      if (stopping) return;
      stopping = true;
      try { child.kill(); } catch { /* mantener pendiente hasta exit */ }
    };
    const timer = setTimeout(() => {
      if (exited || stopping) return;
      outcome = 'timeout';
      kill();
    }, timeoutMs);
    timer.unref?.();

    child.onMessage((message) => {
      if (exited || stopping || outcome || !isSyncTokensResponse(message)) return;
      if (message.kind === 'sync-tokens:ready' && !dispatched) {
        dispatched = true;
        try {
          child.postMessage({
            kind: 'sync-tokens:read',
            databasePath: options.databasePath,
            expected: options.expected,
          });
        } catch {
          outcome = 'failure';
          kill();
        }
        return;
      }
      if (!dispatched || message.kind === 'sync-tokens:ready') return;
      if (message.kind === 'sync-tokens:result') {
        result = message.snapshot;
        outcome = 'ok';
      } else {
        outcome = 'failure';
      }
      try { child.postMessage({ kind: 'sync-tokens:shutdown' }); }
      catch { kill(); }
    });

    child.onExit((exitCode) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (outcome === 'ok' && exitCode === 0 && result !== null) resolve(result);
      else reject(new Error(outcome === 'timeout'
        ? 'Lectura SQLite de sincronización agotó el plazo; no se asume recuperación.'
        : 'No se ha podido confirmar la lectura aislada de tokens SQLite.'));
    });
  });
}
