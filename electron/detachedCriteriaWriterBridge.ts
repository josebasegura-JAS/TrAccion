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
import { saveSessionViaDetachedWriter } from './detachedSessionWriterRunner.js';
import { closeSessionViaDetachedWriter } from './detachedAtomicSessionCloseRunner.js';
import { importSessionHistoryViaDetachedWriter } from './detachedSessionHistoryImportRunner.js';
import { runCoordinationViaDetachedWriter } from './detachedCoordinationWorkflowRunner.js';
import { saveConfiguracionViaDetachedWriter } from './detachedConfiguracionWriterRunner.js';
import { saveLotteryViaDetachedWriter } from './detachedLotteryWriterRunner.js';
import { saveSorteosViaDetachedWriter } from './detachedSorteosWriterRunner.js';
import { saveTeletrabajoBatchViaDetachedWriter } from './detachedTeletrabajoBatchRunner.js';
import type { DetachedTeletrabajoBatchSave } from './detachedTeletrabajoBatchCore.js';
import type { TeletrabajoBatchSaveResult } from './persistence/teletrabajoRepository.js';
import type { DetachedSorteosSave } from './detachedSorteosWriterCore.js';
import type { ConditionalSqliteSorteosSaveResult } from './persistence/sorteosRepository.js';
import type { DetachedLotterySave } from './detachedLotteryWriterCore.js';
import type { LotterySaveResult } from './persistence/loteriaRepository.js';
import type { DetachedConfiguracionSave } from './detachedConfiguracionWriterCore.js';
import type { ConfiguracionSaveResult } from './persistence/configuracionRepository.js';
import type { DetachedCoordinationWorkflow } from './detachedCoordinationWorkflowCore.js';
import type { DetachedSessionHistoryImport } from './detachedSessionHistoryImportCore.js';
import type { DetachedAtomicSessionClose } from './detachedAtomicSessionCloseCore.js';
import type { AtomicSessionWorkflowResult, AtomicSessionHistoryImportResult, AtomicCoordinationWorkflowResult } from './sqlitePersistence.js';
import type { DetachedSessionSave } from './detachedSessionWriterCore.js';
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

/** Adaptador no productivo de Comité, Paritaria y Actas. No incluye los
 * workflows atómicos de cierre/importación, que requieren otra fase. */
export function saveSessionInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedSessionSave,
): Promise<ConditionalSqliteTaskSaveResult> {
  return saveSessionViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Cierre atómico en proceso aislado, únicamente tras cesión/exclusión verificadas.
 * No utilizado por el IPC de producción. */
export function closeSessionAtomicallyInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedAtomicSessionClose,
): Promise<AtomicSessionWorkflowResult> {
  return closeSessionViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Importación histórica atómica de Comité/Paritaria solo para coordinación
 * futura: requiere propiedad única, lock SMB y verificación de identidad.
 * No invocada por main/IPC productivo. */
export function importSessionHistoryInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedSessionHistoryImport,
): Promise<AtomicSessionHistoryImportResult> {
  return importSessionHistoryViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Cierre o creación de tarea en Coordinación, atómicos, no productivos.
 * Solo después de cesión exclusiva y lock SMB validado externamente. */
export function runCoordinationInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedCoordinationWorkflow,
): Promise<AtomicCoordinationWorkflowResult> {
  return runCoordinationViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** No productivo. Requiere cesión exclusiva, lock SMB y confirmación de identidad. */
export function saveConfiguracionInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedConfiguracionSave,
): Promise<ConfiguracionSaveResult> {
  return saveConfiguracionViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Lotería: bridge auxiliar NO productivo. Propiedad SQLite y lock SMB externos obligatorios. */
export function saveLotteryInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedLotterySave,
): Promise<LotterySaveResult> {
  return saveLotteryViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Sorteos+exclusiones: ensayo aislado sin conexión al main productivo. */
export function saveSorteosInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedSorteosSave,
): Promise<ConditionalSqliteSorteosSaveResult> {
  return saveSorteosViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}

/** Teletrabajo masivo NO productivo: exige cesión exclusiva y lock SMB externo. */
export function saveTeletrabajoBatchInDetachedUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  operationId: string,
  payload: DetachedTeletrabajoBatchSave,
): Promise<TeletrabajoBatchSaveResult> {
  return saveTeletrabajoBatchViaDetachedWriter({
    createChild: forkDetachedCriteriaWriter,
    databasePath, expected, operationId, payload,
  });
}
