import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteWorkerLockProof } from './sqliteWorkerOwnershipVerification.js';
import { isDetachedPresupuestosSave, type DetachedPresupuestosSave } from './detachedPresupuestosWriterCore.js';
import type { SimpleJsonSaveResult } from './persistence/simpleJsonModuleRepository.js';
import { isDetachedTeletrabajoBatchSave, type DetachedTeletrabajoBatchSave } from './detachedTeletrabajoBatchCore.js';
import type { TeletrabajoBatchSaveResult } from './persistence/teletrabajoRepository.js';
import { isDetachedSorteosSave, type DetachedSorteosSave } from './detachedSorteosWriterCore.js';
import type { ConditionalSqliteSorteosSaveResult } from './persistence/sorteosRepository.js';
import { isDetachedLotterySave, type DetachedLotterySave } from './detachedLotteryWriterCore.js';
import type { LotterySaveResult } from './persistence/loteriaRepository.js';
import { isDetachedConfiguracionSave, type DetachedConfiguracionSave } from './detachedConfiguracionWriterCore.js';
import type { ConfiguracionSaveResult } from './persistence/configuracionRepository.js';
import type { DetachedCriteriaSave, DetachedCriteriaSaveResult } from './detachedCriteriaWriterCore.js';
import type { DetachedJsonWrite, DetachedJsonBatchResult } from './detachedJsonWriterCore.js';
import { isIsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import type { DetachedTaskSave } from './detachedTaskWriterCore.js';
import type { DetachedSessionSave } from './detachedSessionWriterCore.js';
import { isDetachedAtomicSessionClose, type DetachedAtomicSessionClose } from './detachedAtomicSessionCloseCore.js';
import { isDetachedSessionHistoryImport, type DetachedSessionHistoryImport } from './detachedSessionHistoryImportCore.js';
import { isDetachedCoordinationWorkflow, type DetachedCoordinationWorkflow } from './detachedCoordinationWorkflowCore.js';
import type { ConditionalSqliteTaskSaveResult, AtomicSessionWorkflowResult, AtomicSessionHistoryImportResult, AtomicCoordinationWorkflowResult } from './sqlitePersistence.js';

export type DetachedWriterRequest =
  | { kind: 'detached:open'; databasePath: string; expected: ExpectedSqliteIdentity }
  | { kind: 'detached:open-session'; databasePath: string; expected: ExpectedSqliteIdentity; generation: number }
  | { kind: 'detached:save'; operationId: string; record: DetachedCriteriaSave }
  | { kind: 'detached:save-criteria-receipted'; operationId: string; generation: number; databaseUuid: string; record: DetachedCriteriaSave }
  | { kind: 'detached:save-json-batch'; operationId: string; table: string; records: DetachedJsonWrite[] }
  | { kind: 'detached:save-json-batch-receipted'; operationId: string; generation: number; databaseUuid: string; table: string; records: DetachedJsonWrite[] }
  | { kind: 'detached:save-task'; operationId: string; payload: DetachedTaskSave }
  | { kind: 'detached:save-task-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedTaskSave }
  | { kind: 'detached:save-session'; operationId: string; payload: DetachedSessionSave }
  | { kind: 'detached:save-session-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedSessionSave }
  | { kind: 'detached:close-session-atomically'; operationId: string; payload: DetachedAtomicSessionClose }
  | { kind: 'detached:import-session-history'; operationId: string; payload: DetachedSessionHistoryImport }
  | { kind: 'detached:coordination-workflow'; operationId: string; payload: DetachedCoordinationWorkflow }
  | { kind: 'detached:save-configuracion'; operationId: string; payload: DetachedConfiguracionSave }
  | { kind: 'detached:save-configuracion-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedConfiguracionSave }
  | { kind: 'detached:save-lottery'; operationId: string; payload: DetachedLotterySave }
  | { kind: 'detached:save-lottery-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedLotterySave }
  | { kind: 'detached:save-sorteos'; operationId: string; payload: DetachedSorteosSave }
  | { kind: 'detached:save-sorteos-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedSorteosSave }
  | { kind: 'detached:save-teletrabajo-batch'; operationId: string; payload: DetachedTeletrabajoBatchSave }
  | { kind: 'detached:save-teletrabajo-batch-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedTeletrabajoBatchSave }
  | { kind: 'detached:save-presupuestos'; operationId: string; payload: DetachedPresupuestosSave }
  | { kind: 'detached:save-presupuestos-receipted'; operationId: string; generation: number; databaseUuid: string; payload: DetachedPresupuestosSave }
  | { kind: 'detached:close' };

export type DetachedWriterResponse =
  | { kind: 'detached:ready' }
  | { kind: 'detached:opened' }
  | { kind: 'detached:session-opened'; generation: number; proof: SqliteWorkerLockProof }
  | { kind: 'detached:saved'; operationId: string; result: DetachedCriteriaSaveResult }
  | { kind: 'detached:criteria-receipted'; operationId: string; result: DetachedCriteriaSaveResult }
  | { kind: 'detached:json-batch-saved'; operationId: string; result: DetachedJsonBatchResult }
  | { kind: 'detached:json-batch-receipted'; operationId: string; result: DetachedJsonBatchResult }
  | { kind: 'detached:task-saved'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:task-receipted'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:session-saved'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:session-receipted'; operationId: string; result: ConditionalSqliteTaskSaveResult }
  | { kind: 'detached:session-closed-atomically'; operationId: string; result: AtomicSessionWorkflowResult }
  | { kind: 'detached:session-history-imported'; operationId: string; result: AtomicSessionHistoryImportResult }
  | { kind: 'detached:coordination-workflow-done'; operationId: string; result: AtomicCoordinationWorkflowResult }
  | { kind: 'detached:configuracion-saved'; operationId: string; result: ConfiguracionSaveResult }
  | { kind: 'detached:configuracion-receipted'; operationId: string; result: ConfiguracionSaveResult }
  | { kind: 'detached:lottery-saved'; operationId: string; result: LotterySaveResult }
  | { kind: 'detached:lottery-receipted'; operationId: string; result: LotterySaveResult }
  | { kind: 'detached:sorteos-saved'; operationId: string; result: ConditionalSqliteSorteosSaveResult }
  | { kind: 'detached:sorteos-receipted'; operationId: string; result: ConditionalSqliteSorteosSaveResult }
  | { kind: 'detached:teletrabajo-batch-saved'; operationId: string; result: TeletrabajoBatchSaveResult }
  | { kind: 'detached:teletrabajo-batch-receipted'; operationId: string; result: TeletrabajoBatchSaveResult }
  | { kind: 'detached:presupuestos-saved'; operationId: string; result: SimpleJsonSaveResult }
  | { kind: 'detached:presupuestos-receipted'; operationId: string; result: SimpleJsonSaveResult }
  | { kind: 'detached:closed' }
  | { kind: 'detached:error'; operationId?: string };

export function isDetachedWriterRequest(value: unknown): value is DetachedWriterRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.kind === 'detached:close') return true;
  if (r.kind === 'detached:save-presupuestos-receipted' ||
      r.kind === 'detached:save-configuracion-receipted') {
    if (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0 ||
        typeof r.databaseUuid !== 'string' || !r.databaseUuid.trim()) return false;
    return r.kind === 'detached:save-presupuestos-receipted'
      ? isDetachedWriterRequest({ kind: 'detached:save-presupuestos', operationId: r.operationId, payload: r.payload })
      : isDetachedWriterRequest({ kind: 'detached:save-configuracion', operationId: r.operationId, payload: r.payload });
  }
  if (r.kind === 'detached:save-presupuestos') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() && isDetachedPresupuestosSave(r.payload);
  }
  if (r.kind === 'detached:save-lottery-receipted' ||
      r.kind === 'detached:save-sorteos-receipted' ||
      r.kind === 'detached:save-teletrabajo-batch-receipted') {
    if (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0 ||
        typeof r.databaseUuid !== 'string' || !r.databaseUuid.trim()) return false;
    if (r.kind === 'detached:save-lottery-receipted')
      return isDetachedWriterRequest({ kind: 'detached:save-lottery', operationId: r.operationId, payload: r.payload });
    if (r.kind === 'detached:save-sorteos-receipted')
      return isDetachedWriterRequest({ kind: 'detached:save-sorteos', operationId: r.operationId, payload: r.payload });
    return isDetachedWriterRequest({ kind: 'detached:save-teletrabajo-batch', operationId: r.operationId, payload: r.payload });
  }
  if (r.kind === 'detached:save-teletrabajo-batch') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() && isDetachedTeletrabajoBatchSave(r.payload);
  }
  if (r.kind === 'detached:save-sorteos') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() && isDetachedSorteosSave(r.payload);
  }
  if (r.kind === 'detached:save-lottery') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() && isDetachedLotterySave(r.payload);
  }
  if (r.kind === 'detached:save-configuracion') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() && isDetachedConfiguracionSave(r.payload);
  }
  if (r.kind === 'detached:open' || r.kind === 'detached:open-session') {
    if (r.kind === 'detached:open-session' &&
        (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0)) return false;
    if (typeof r.databasePath !== 'string' || !r.databasePath.trim()) return false;
    const e = r.expected as Record<string, unknown> | null;
    return !!e && typeof e === 'object' && typeof e.databaseUuid === 'string' && !!e.databaseUuid
      && typeof e.applicationId === 'string' && !!e.applicationId
      && typeof e.environment === 'string' && !!e.environment
      && Number.isSafeInteger(e.schemaVersion) && Number(e.schemaVersion) >= 0;
  }
  if (r.kind === 'detached:coordination-workflow') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() &&
      isDetachedCoordinationWorkflow(r.payload);
  }
  if (r.kind === 'detached:import-session-history') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() &&
      isDetachedSessionHistoryImport(r.payload);
  }
  if (r.kind === 'detached:close-session-atomically') {
    return typeof r.operationId === 'string' && !!r.operationId.trim() &&
      isDetachedAtomicSessionClose(r.payload);
  }
  if (r.kind === 'detached:save-task-receipted' || r.kind === 'detached:save-session-receipted') {
    if (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0 ||
        typeof r.databaseUuid !== 'string' || !r.databaseUuid.trim()) return false;
    return r.kind === 'detached:save-task-receipted'
      ? isDetachedWriterRequest({ kind: 'detached:save-task', operationId: r.operationId, payload: r.payload })
      : isDetachedWriterRequest({ kind: 'detached:save-session', operationId: r.operationId, payload: r.payload });
  }
  if (r.kind === 'detached:save-session') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.payload || typeof r.payload !== 'object') return false;
    const payload = r.payload as Record<string, unknown>;
    if (!['comite', 'paritaria', 'actas'].includes(String(payload.module)) ||
        typeof payload.ownerId !== 'string' || !payload.ownerId.trim() ||
        !payload.record || typeof payload.record !== 'object') return false;
    const record = payload.record as Record<string, unknown>;
    return typeof record.id === 'string' && !!record.id.trim() &&
      typeof record.value === 'string' && !!record.value.trim() &&
      (record.expectedUpdatedAt === null || typeof record.expectedUpdatedAt === 'string');
  }
  if (r.kind === 'detached:save-task') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.payload || typeof r.payload !== 'object') return false;
    const payload = r.payload as Record<string, unknown>;
    if (typeof payload.ownerId !== 'string' || !payload.ownerId.trim() ||
        !payload.record || typeof payload.record !== 'object') return false;
    const record = payload.record as Record<string, unknown>;
    return typeof record.id === 'string' && !!record.id.trim() &&
      typeof record.value === 'string' && !!record.value.trim() &&
      (record.expectedUpdatedAt === null || typeof record.expectedUpdatedAt === 'string');
  }
  if (r.kind === 'detached:save-json-batch-receipted') {
    if (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0 ||
        typeof r.databaseUuid !== 'string' || !r.databaseUuid.trim()) return false;
    return isDetachedWriterRequest({ kind: 'detached:save-json-batch',
      operationId: r.operationId, table: r.table, records: r.records });
  }
  if (r.kind === 'detached:save-json-batch') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        typeof r.table !== 'string' || !isIsolatedJsonTable(r.table) ||
        !Array.isArray(r.records) || !r.records.length || r.records.length > 1000) return false;
    return r.records.every((item: unknown) => {
      if (!item || typeof item !== 'object') return false;
      const row = item as Record<string, unknown>;
      return typeof row.id === 'string' && !!row.id.trim() &&
        typeof row.value === 'string' && !!row.value.trim() &&
        (row.expectedUpdatedAt === null || typeof row.expectedUpdatedAt === 'string');
    });
  }
  if (r.kind === 'detached:save-criteria-receipted') {
    if (!Number.isSafeInteger(r.generation) || Number(r.generation) <= 0 ||
        typeof r.databaseUuid !== 'string' || !r.databaseUuid.trim()) return false;
    return isDetachedWriterRequest({ kind: 'detached:save',
      operationId: r.operationId, record: r.record });
  }
  if (r.kind === 'detached:save') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim()) return false;
    const d = r.record as Record<string, unknown> | null;
    return !!d && typeof d === 'object' && typeof d.id === 'string' && !!d.id.trim()
      && typeof d.value === 'string'
      && (d.expectedUpdatedAt === null || typeof d.expectedUpdatedAt === 'string');
  }
  return false;
}

export function isDetachedWriterResponse(value: unknown): value is DetachedWriterResponse {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (['detached:ready', 'detached:opened', 'detached:closed'].includes(String(r.kind))) return true;
  if (r.kind === 'detached:error') return r.operationId === undefined || typeof r.operationId === 'string';
  if (r.kind === 'detached:session-opened') {
    const p = r.proof as Record<string, unknown> | null;
    return Number.isSafeInteger(r.generation) && Number(r.generation) > 0 &&
      !!p && typeof p === 'object' && typeof p.ownerId === 'string' &&
      p.ownerId.startsWith('detached-writer:') && typeof p.hostname === 'string' &&
      typeof p.pid === 'number' && Number.isSafeInteger(p.pid) && Number(p.pid) > 0 &&
      typeof p.createdAt === 'string' && !!p.createdAt.trim();
  }
  if (r.kind === 'detached:presupuestos-receipted' || r.kind === 'detached:configuracion-receipted') {
    return r.kind === 'detached:presupuestos-receipted'
      ? isDetachedWriterResponse({ kind: 'detached:presupuestos-saved', operationId: r.operationId, result: r.result })
      : isDetachedWriterResponse({ kind: 'detached:configuracion-saved', operationId: r.operationId, result: r.result });
  }
  if (r.kind === 'detached:presupuestos-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() || !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:lottery-receipted' ||
      r.kind === 'detached:sorteos-receipted' ||
      r.kind === 'detached:teletrabajo-batch-receipted') {
    if (r.kind === 'detached:lottery-receipted')
      return isDetachedWriterResponse({ kind: 'detached:lottery-saved', operationId: r.operationId, result: r.result });
    if (r.kind === 'detached:sorteos-receipted')
      return isDetachedWriterResponse({ kind: 'detached:sorteos-saved', operationId: r.operationId, result: r.result });
    return isDetachedWriterResponse({ kind: 'detached:teletrabajo-batch-saved', operationId: r.operationId, result: r.result });
  }
  if (r.kind === 'detached:teletrabajo-batch-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() || !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string,unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      Array.isArray(result.results) && (result.failedRecordId === undefined || typeof result.failedRecordId === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:sorteos-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() || !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string,unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.currentDrawsUpdatedAt === null || typeof result.currentDrawsUpdatedAt === 'string') &&
      (result.currentExclusionsUpdatedAt === null || typeof result.currentExclusionsUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:lottery-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.campaignUpdatedAt === null || typeof result.campaignUpdatedAt === 'string') &&
      !!result.requestUpdatedAt && typeof result.requestUpdatedAt === 'object' &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:configuracion-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:coordination-workflow-done') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.meetingUpdatedAt === undefined || typeof result.meetingUpdatedAt === 'string') &&
      (result.indexUpdatedAt === undefined || typeof result.indexUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:session-history-imported') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      Number.isSafeInteger(result.importedSessionCount) && Number(result.importedSessionCount) >= 0 &&
      Number.isSafeInteger(result.createdTaskCount) && Number(result.createdTaskCount) >= 0 &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:session-closed-atomically') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:task-receipted' || r.kind === 'detached:session-receipted') {
    return r.kind === 'detached:task-receipted'
      ? isDetachedWriterResponse({kind: 'detached:task-saved', operationId: r.operationId, result: r.result})
      : isDetachedWriterResponse({kind: 'detached:session-saved', operationId: r.operationId, result: r.result});
  }
  if (r.kind === 'detached:task-saved' || r.kind === 'detached:session-saved') {
    if (typeof r.operationId !== 'string' || !r.operationId.trim() ||
        !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    return typeof result.ok === 'boolean' && typeof result.message === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string') &&
      !!result.status && typeof result.status === 'object';
  }
  if (r.kind === 'detached:json-batch-receipted') {
    return isDetachedWriterResponse({ kind: 'detached:json-batch-saved',
      operationId: r.operationId, result: r.result });
  }
  if (r.kind === 'detached:json-batch-saved') {
    if (typeof r.operationId !== 'string' || !r.result || typeof r.result !== 'object') return false;
    const result = r.result as Record<string, unknown>;
    if (result.ok === true) return Array.isArray(result.results) &&
      result.results.every((item: unknown) => {
        if (!item || typeof item !== 'object') return false;
        const v = item as Record<string, unknown>;
        return v.ok === true && typeof v.currentUpdatedAt === 'string';
      });
    return result.ok === false && typeof result.failedRecordId === 'string' &&
      (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string');
  }
  if (r.kind === 'detached:criteria-receipted') {
    return isDetachedWriterResponse({ kind: 'detached:saved', operationId: r.operationId, result: r.result });
  }
  if (r.kind !== 'detached:saved' || typeof r.operationId !== 'string') return false;
  const result = r.result as Record<string, unknown> | null;
  return !!result && typeof result === 'object' &&
    ((result.ok === true && typeof result.updatedAt === 'string') ||
      (result.ok === false && result.conflict === true &&
        (result.currentUpdatedAt === null || typeof result.currentUpdatedAt === 'string')));
}
