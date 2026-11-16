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

export interface DetachedWriterUncertainEvent {
  operationId: string;
  phase: 'ready' | 'opening' | 'saving' | 'closing';
  reason: 'timeout' | 'protocol' | 'unexpected-exit' | 'send-failed';
  /** Sin exit confirmado no puede liberarse la propiedad del proceso hijo. */
  exitConfirmed: boolean;
}

export interface DetachedWriterSessionOptions {
  createChild: () => DetachedWriterChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  operationId: string;
  record: DetachedCriteriaSave;
  timeoutMs?: number;
  /** Señal inmediata para poner en cuarentena la sesión; no confirma cancelación. */
  onUncertain?: (event: DetachedWriterUncertainEvent) => void;
  /** Notifica la salida REAL (nunca solo kill), para conciliar antes de liberar propiedad. */
  onExitConfirmed?: (operationId: string, code: number) => void;
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
    let uncertainReported = false;
    const signalUncertain = (reason: DetachedWriterUncertainEvent['reason'], exitConfirmed: boolean): void => {
      if (uncertainReported) return;
      uncertainReported = true;
      try {
        options.onUncertain?.({
          operationId: options.operationId,
          phase,
          reason,
          exitConfirmed,
        });
      } catch {
        // La instrumentación no altera el protocolo ni presume éxito.
      }
    };

    const kill = (): void => {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch { /* No declarar liberado sin recibir exit. */ }
    };
    const fail = (reason: DetachedWriterUncertainEvent['reason']): void => {
      outcome = 'failed';
      signalUncertain(reason, false);
      kill();
    };
    const send = (request: DetachedWriterRequest): void => {
      try { child.postMessage(request); } catch { fail('send-failed'); }
    };

    // No resolver por timeout: aunque se pida kill, el proceso podría
    // continuar escribiendo o seguir reteniendo el handle. Esperar exit.
    const timer = setTimeout(() => {
      if (exited || stopped) return;
      outcome = 'timeout';
      signalUncertain('timeout', false);
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
        fail('protocol');
      }
    });
    child.onExit((code) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      try { options.onExitConfirmed?.(options.operationId, code); }
      catch { /* La instrumentación no cambia el resultado del guardado. */ }
      // Confirmar exit al llamador solo mediante el resultado final del
      // protocolo. Una notificación previa de timeout sigue siendo incierta.
      if (!(outcome === 'ok' && phase === 'closing' && code === 0 && completed !== null)) {
        signalUncertain('unexpected-exit', true);
      }
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
