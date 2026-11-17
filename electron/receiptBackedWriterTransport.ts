/**
 * PR501 — receipt-only request admission for the experimental writer.
 * Not wired to renderer IPC or active sqlitePersistence.
 *
 * No automatic retry, even after a timeout. A wire ACK is NOT durable commit
 * proof: a journal record remains unresolved until verified SQLite receipts.
 */
import {
  isDetachedWriterRequest, isDetachedWriterResponse,
  type DetachedWriterRequest,
} from './detachedCriteriaWriterProtocol.js';

const RESPONSE_FOR_REQUEST = {
  'detached:save-criteria-receipted': 'detached:criteria-receipted',
  'detached:save-json-batch-receipted': 'detached:json-batch-receipted',
  'detached:save-task-receipted': 'detached:task-receipted',
  'detached:save-session-receipted': 'detached:session-receipted',
  'detached:close-session-atomically-receipted': 'detached:session-closed-atomically-receipted',
  'detached:import-session-history-receipted': 'detached:session-history-imported-receipted',
  'detached:coordination-workflow-receipted': 'detached:coordination-workflow-done-receipted',
  'detached:save-configuracion-receipted': 'detached:configuracion-receipted',
  'detached:save-lottery-receipted': 'detached:lottery-receipted',
  'detached:save-sorteos-receipted': 'detached:sorteos-receipted',
  'detached:save-teletrabajo-batch-receipted': 'detached:teletrabajo-batch-receipted',
  'detached:save-presupuestos-receipted': 'detached:presupuestos-receipted',
} as const;

export type ReceiptedWriterRequest = Extract<
  DetachedWriterRequest,
  { kind: keyof typeof RESPONSE_FOR_REQUEST }
>;

export interface ReceiptedTransportDependencies {
  /** Coordinator durably journals BEFORE message transport is invoked. */
  registerWriterOperation(id: string, generation: number, receiptBacked: true): void;
  /** ACK is recorded, but operation is NOT considered reconciled. */
  acknowledgeWriterOperation(id: string, generation: number): void;
  /** QUARANTINE on uncertain transport/response; must never enable retry. */
  workerUncertain(generation: number): void;
  sendAndAwait(request: ReceiptedWriterRequest): Promise<unknown>;
}

export async function sendReceiptBackedWriterOperation(
  deps: ReceiptedTransportDependencies,
  expectedDatabaseUuid: string,
  request: ReceiptedWriterRequest,
): Promise<unknown> {
  if (!isDetachedWriterRequest(request) ||
      !(request.kind in RESPONSE_FOR_REQUEST) ||
      !Number.isSafeInteger(request.generation) || request.generation <= 0 ||
      !request.operationId.trim() ||
      !expectedDatabaseUuid.trim() || request.databaseUuid !== expectedDatabaseUuid) {
    throw new Error('Operación receipted SQLite inválida o identidad diferente.');
  }
  // A failure here MUST prevent any message from reaching the child.
  deps.registerWriterOperation(request.operationId, request.generation, true);
  try {
    const response = await deps.sendAndAwait(request);
    const expectedKind = RESPONSE_FOR_REQUEST[request.kind];
    if (!isDetachedWriterResponse(response) ||
        response.kind !== expectedKind ||
        !('operationId' in response) ||
        response.operationId !== request.operationId) {
      throw new Error('ACK de SQLite no verificable o de otra operación.');
    }
    deps.acknowledgeWriterOperation(request.operationId, request.generation);
    // The journal still contains an ACK, not a durable commit decision.
    return response;
  } catch (error) {
    // An on-wire request may have committed. Do not retry or infer failure.
    try { deps.workerUncertain(request.generation); }
    catch { /* never replace original failure with a recovery permission */ }
    throw error;
  }
}
