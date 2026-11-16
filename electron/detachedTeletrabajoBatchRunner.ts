/**
 * Un lote transaccional de Teletrabajo en utilityProcess solo después de cesión exclusiva,
 * bloque SMB adquirido y verificación de identidad de la base compartida.
 * No integrar en IPC de producción hasta cubrir TODOS los repositorios.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import { isDetachedTeletrabajoBatchSave, type DetachedTeletrabajoBatchSave } from './detachedTeletrabajoBatchCore.js';
import type { TeletrabajoBatchSaveResult } from './persistence/teletrabajoRepository.js';
import type { DetachedWriterChild } from './detachedCriteriaWriterRunner.js';
import { isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';

export function saveTeletrabajoBatchViaDetachedWriter(options: {
  createChild: () => DetachedWriterChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  operationId: string;
  payload: DetachedTeletrabajoBatchSave;
  timeoutMs?: number;
}): Promise<TeletrabajoBatchSaveResult> {
  if (!options.databasePath.trim() || !options.operationId.trim() ||
      !isDetachedTeletrabajoBatchSave(options.payload)) {
    return Promise.reject(new Error('Parámetros de Teletrabajo aislado inválidos.'));
  }
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Tiempo de espera inválido.'));
  }
  return new Promise((resolve, reject) => {
    let child: DetachedWriterChild;
    try { child = options.createChild(); }
    catch { reject(new Error('No se pudo iniciar el escritor SQLite.')); return; }
    let phase: 'ready' | 'opening' | 'saving' | 'closing' = 'ready';
    let completed: TeletrabajoBatchSaveResult | null = null;
    let uncertain = false;
    let stopped = false;
    let exited = false;
    const kill = () => {
      if (stopped) return;
      stopped = true;
      try { child.kill(); } catch { /* Solo exit acredita terminación. */ }
    };
    const timer = setTimeout(() => {
      if (exited || stopped) return;
      uncertain = true;
      kill();
    }, timeoutMs);
    timer.unref?.();
    const send = (message: Parameters<DetachedWriterChild['postMessage']>[0]) => {
      try { child.postMessage(message); } catch { uncertain = true; kill(); }
    };
    child.onMessage((value) => {
      if (exited || stopped || !isDetachedWriterResponse(value)) return;
      if (phase === 'ready' && value.kind === 'detached:ready') {
        phase = 'opening';
        send({ kind: 'detached:open', databasePath: options.databasePath, expected: options.expected });
      } else if (phase === 'opening' && value.kind === 'detached:opened') {
        phase = 'saving';
        send({ kind: 'detached:save-teletrabajo-batch', operationId: options.operationId, payload: options.payload });
      } else if (phase === 'saving' && value.kind === 'detached:teletrabajo-batch-saved' &&
                 value.operationId === options.operationId) {
        completed = value.result;
        phase = 'closing';
        send({ kind: 'detached:close' });
      } else if (phase === 'closing' && value.kind === 'detached:closed') {
        // El mensaje de cierre no es prueba de salida del proceso.
      } else {
        uncertain = true;
        kill();
      }
    });
    child.onExit((code) => {
      if (exited) return;
      exited = true;
      clearTimeout(timer);
      if (!uncertain && !stopped && code === 0 && phase === 'closing' && completed !== null) {
        resolve(completed);
      } else {
        reject(new Error('Resultado SQLite incierto: confirmar salida, identidad y versión antes de cualquier reintento.'));
      }
    });
  });
}
