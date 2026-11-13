/**
 * Ejecutor de una operación de escritura REAL con utilityProcess.
 *
 * Se utiliza únicamente en sesiones con propiedad exclusiva otorgada por
 * una capa superior. No crea locks SMB ni habilita producción por sí mismo.
 * Cualquier resultado se publica solo tras EXIT(0) del proceso propietario.
 * Nunca reintenta una escritura cuyo resultado podría ser incierto.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { DetachedCriteriaSave, DetachedCriteriaSaveResult } from './detachedCriteriaWriterCore.js';
import {
  isDetachedWriterResponse,
  type DetachedWriterRequest,
} from './detachedCriteriaWriterProtocol.js';

export interface DetachedWriterChild {
  postMessage(message: DetachedWriterRequest): void;
  onMessage(handler: (message: unknown) => void): void;
  onExit(handler: (exitCode: number) => void): void;
  kill(): void;
}

export interface DetachedWriterSessionOptions {
  createChild: () => DetachedWriterChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  operationId: string;
  record: DetachedCriteriaSave;
  timeoutMs?: number;
}

export function saveCriteriaViaDetachedWriter(
  options: DetachedWriterSessionOptions,
): Promise<DetachedCriteriaSaveResult> {
  if (!options.databasePath.trim() || !options.operationId.trim()) {
    return Promise.reject(new Error('Ruta o identificador de escritura inválido.'));
  }
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Timeout del escritor SQLite inválido.'));
  }

  return new Promise((resolve, reject) => {
    let child: DetachedWriterChild;
    try { child = options.createChild(); }
    catch { reject(new Error('No se ha podido iniciar el proceso escritor SQLite.')); return; }

    let phase: 'ready' | 'opening' | 'saving' | 'closing' = 'ready';
    let outcome: 'ok' | 'failed' | 'timeout' = 'failed';
    let completed: DetachedCriteriaSaveResult | null = null;
    let exited = false;
    let stopped = false;

    const kill = (): void => {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch { /* No declarar liberado sin recibir exit. */ }
    };
    const fail = (): void => { outcome = 'failed'; kill(); };
    const send = (request: DetachedWriterRequest): void => {
      try { child.postMessage(request); } catch { fail(); }
    };

    // No resolver por timeout: aunque se pida kill, el proceso podría
    // continuar escribiendo o seguir reteniendo el handle. Esperar exit.
    const timer = setTimeout(() => {
      if (exited || stopped) return;
      outcome = 'timeout';
      kill();
    }, timeoutMs);
    timer.unref?.();

    child.onMessage((message) => {
      if (exited || stopped || !isDetachedWriterResponse(message)) return;
      if (phase === 'ready' && message.kind === 'detached:ready') {
        phase = 'opening';
        send({ kind: 'detached:open', databasePath: options.databasePath, expected: options.expected });
      } else if (phase === 'opening' && message.kind === 'detached:opened') {
        phase = 'saving';
        send({ kind: 'detached:save', operationId: options.operationId, record: options.record });
      } else if (phase === 'saving' && message.kind === 'detached:saved' &&
                 message.operationId === options.operationId) {
        completed = message.result;
        outcome = 'ok';
        phase = 'closing';
        send({ kind: 'detached:close' });
      } else if (phase === 'closing' && message.kind === 'detached:closed') {
        // La confirmación de mensaje NO sustituye el exit(0) real.
      } else {
        fail();
      }
    });
    child.onExit((code) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (outcome === 'ok' && phase === 'closing' && code === 0 && completed !== null) {
        resolve(completed);
      } else {
        reject(new Error(outcome === 'timeout'
          ? 'El guardado SQLite agotó el plazo y terminó el proceso: resultado incierto; no repetir automáticamente.'
          : 'No se puede confirmar el guardado SQLite aislado; comprobar el registro antes de reintentar.'));
      }
    });
  });
}
