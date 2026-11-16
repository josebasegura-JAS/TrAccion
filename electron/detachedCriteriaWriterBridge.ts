/** Puente de ejecución del primer escritor real en utilityProcess.
 * NO se importa desde main ni desde los handlers IPC de producción.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { DetachedCriteriaSave, DetachedCriteriaSaveResult } from './detachedCriteriaWriterCore.js';
import { saveCriteriaViaDetachedWriter } from './detachedCriteriaWriterRunner.js';
import { saveJsonBatchViaDetachedWriter } from './detachedJsonWriterRunner.js';
import type { DetachedJsonWrite, DetachedJsonBatchResult } from './detachedJsonWriterCore.js';
import { saveTaskViaDetachedWriter } from './detachedTaskWriterRunner.js';
import type { DetachedTaskSave } from './detachedTaskWriterCore.js';
import type { ConditionalSqliteTaskSaveResult } from './sqlitePersistence.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DetachedCriteriaWriterChild {
  postMessage(message: DetachedWriterRequest): void;
  onMessage(handler: (data: unknown) => void): void;
  onExit(handler: (code: number) => void): void;
  kill(): void;
}

export function forkDetachedCriteriaWriter(): DetachedCriteriaWriterChild {
  const child = utilityProcess.fork(path.join(__dirname, 'detachedCriteriaWriterWorker.js'), [], {
    serviceName: 'TrAcción · escritor SQLite aislado (ensayo)',
  });
  return {
    postMessage: message => child.postMessage(message),
    onMessage: handler => { child.on('message', event => handler(event.data)); },
    onExit: handler => { child.on('exit', handler); },
    kill: () => { child.kill(); },
  };
}

/**
 * Ruta real de ejecución del primer guardado auxiliar.
 * No invocar contra producción hasta completar propiedad única, cola,
 * locks distribuidos y migración de todos los módulos escritores.
 */
export function saveCriteriaInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  record: DetachedCriteriaSave,
): Promise<DetachedCriteriaSaveResult> {
  return saveCriteriaViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath,
    expected,
    operationId,
    record,
  });
}

/**
 * Escritura genérica con el MISMO proceso controlado, sin conexión al
 * runtime productivo. Solo tras cesión validada del motor y bloqueo SMB.
 */
export function saveJsonBatchInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  table: string,
  records: DetachedJsonWrite[],
): Promise<DetachedJsonBatchResult> {
  return saveJsonBatchViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, table, records,
  });
}

/**
 * Escritor de Tareas especializado. Sin ruta de producción hasta cerrar y
 * verificar la cesión del propietario SQLite y el lock SMB distribuido.
 */
export function saveTaskInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedTaskSave,
): Promise<ConditionalSqliteTaskSaveResult> {
  return saveTaskViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}
