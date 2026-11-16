/**
 * PR444: executor de lotes JSON en utilityProcess.
 * Preparado para la cesión exclusiva posterior. Nunca se llama desde IPC
 * de producción mientras main mantenga un handle SQLite.
 */
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { DetachedJsonWrite, DetachedJsonBatchResult } from './detachedJsonWriterCore.js';
import type { DetachedWriterChild } from './detachedCriteriaWriterRunner.js';
import { isDetachedWriterResponse } from './detachedCriteriaWriterProtocol.js';
import { isIsolatedJsonTable } from './persistence/isolatedJsonTables.js';

export interface DetachedJsonBatchOptions {
  createChild: () => DetachedWriterChild;
  databasePath: string;
  expected: ExpectedSqliteIdentity;
  operationId: string;
  table: string;
  records: DetachedJsonWrite[];
  timeoutMs?: number;
}

export function saveJsonBatchViaDetachedWriter(
  options: DetachedJsonBatchOptions,
): Promise<DetachedJsonBatchResult> {
  if (!options.databasePath.trim() || !options.operationId.trim() ||
      !isIsolatedJsonTable(options.table) || !options.records.length ||
      options.records.length > 1000) {
    return Promise.reject(new Error('Petición de lote SQLite inválida.'));
  }
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Timeout escritor inválido.'));
  }
  return new Promise((resolve, reject) => {
    let child: DetachedWriterChild;
    try { child = options.createChild(); } catch {
      reject(new Error('No se pudo crear el escritor auxiliar.'));
      return;
    }
    let phase: 'starting' | 'opening' | 'writing' | 'closing' = 'starting';
    let completed: DetachedJsonBatchResult | null = null;
    let timedOut = false;
    let terminated = false;
    let exitSeen = false;
    const kill = (): void => {
      if (terminated) return;
      terminated = true;
      try { child.kill(); } catch { /* No liberar hasta confirmar exit. */ }
    };
    const timer = setTimeout(() => { if (!exitSeen) { timedOut = true; kill(); } }, timeoutMs);
    timer.unref?.();
    const send = (message: Parameters<DetachedWriterChild['postMessage']>[0]) => {
      try { child.postMessage(message); } catch { kill(); }
    };
    child.onMessage(message => {
      if (exitSeen || terminated || !isDetachedWriterResponse(message)) return;
      if (phase === 'starting' && message.kind === 'detached:ready') {
        phase = 'opening';
        send({ kind: 'detached:open', databasePath: options.databasePath, expected: options.expected });
      } else if (phase === 'opening' && message.kind === 'detached:opened') {
        phase = 'writing';
        send({ kind: 'detached:save-json-batch', operationId: options.operationId,
          table: options.table, records: options.records });
      } else if (phase === 'writing' && message.kind === 'detached:json-batch-saved' &&
                 message.operationId === options.operationId) {
        completed = message.result;
        phase = 'closing';
        send({ kind: 'detached:close' });
      } else if (phase === 'closing' && message.kind === 'detached:closed') {
        // El aviso no sustituye a la confirmación de salida del proceso.
      } else {
        kill();
      }
    });
    child.onExit(code => {
      if (exitSeen) return;
      exitSeen = true;
      clearTimeout(timer);
      if (!terminated && !timedOut && code === 0 && phase === 'closing' && completed !== null) {
        resolve(completed);
      } else {
        reject(new Error(timedOut
          ? 'El escritor SQLite superó el tiempo: resultado incierto, no reintentar automáticamente.'
          : 'Salida del escritor SQLite no confirmada: resultado incierto, requiere reconciliación.'));
      }
    });
  });
}
