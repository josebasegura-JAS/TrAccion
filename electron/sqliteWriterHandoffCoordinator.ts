/**
 * PR9D-5A · Contrato de cesión del motor escritor.
 *
 * No se conecta aún al arranque de producción. La única forma válida de
 * activar un worker escritor debe pasar por este coordinador: ninguna apertura
 * en el hijo antes de confirmar cierre de la conexión anterior.
 */
import type { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';
import { createSqliteWriterOperationLedger } from './sqliteWriterOperationLedger.js';
import type { DurableWriterJournal, SqliteReconciliationEvidence } from './durableWriterJournal.js';
import {
  createSqliteEngineOwnershipFence,
  type SqliteQueueState,
} from './sqliteEngineOwnershipFence.js';

type IndependentActivityBarrier = Pick<
  ReturnType<typeof createSqliteIndependentActivityTracker>,
  'beginFreeze' | 'waitForDrain' | 'assertFrozenTicket' | 'abortFreeze'
>;

export interface WriterHandoffDependencies {
  /** Optional until production activation; MUST be provided for production. */
  durableJournal?: DurableWriterJournal;
  /**
   * Barrera de admisión fuera de la cola IPC. Es OBLIGATORIA: sin ella,
   * un heartbeat, backup o lector readonly podría entrar tras el preflight.
   */
  independentActivity: IndependentActivityBarrier;
  /** La cola global y TODOS los trabajos fuera de cola deben estar inactivos. */
  inspectQueue: () => SqliteQueueState;
  /** Aborta si hay backups, migraciones, heartbeat, timer o IO ajena a la cola. */
  assertNoIndependentSqliteActivity: () => Promise<void>;
  /** Resuelve solo si la conexión nativa principal ha cerrado realmente. */
  closeMainHandle: () => Promise<void>;
  /** Resuelve solo cuando el proceso hijo confirma inicio y propiedad única. */
  startWriter: (generation: number) => Promise<{ generation: number }>;
  /** Independent check against actual shared .lockdir AFTER the child starts. */
  verifyWorkerSmbOwnership: (generation: number) => Promise<void>;
}

export function createSqliteWriterHandoffCoordinator(
  fence: ReturnType<typeof createSqliteEngineOwnershipFence>,
  deps: WriterHandoffDependencies,
) {
  let pending: Promise<number> | null = null;
  let activeFreezeTicket: number | null = null;
  // Libro privado: solo la conciliación en cuarentena puede levantar una incertidumbre.
  const operationLedger = createSqliteWriterOperationLedger();
  let confirmedExitGeneration: number | null = null;

  function assertCurrentWorker(generation: number): void {
    const owner = fence.snapshot();
    if (owner.owner !== 'worker' || owner.generation !== generation) {
      throw new Error('El escritor SQLite no pertenece a la generación activa.');
    }
  }

  async function performHandoff(): Promise<number> {
    // A journal from a previous process may contain orphaned operations.
    // Refuse to transfer ownership even when the in-memory ledger is empty.
    if (deps.durableJournal?.unsettled().length) {
      throw new Error('Journal durable con escrituras no conciliadas: cesión SQLite bloqueada.');
    }
    // beginHandoff impide admitir operaciones nuevas inmediatamente.
    const ticket = fence.beginHandoff(deps.inspectQueue());
    let closeAttempted = false;
    let freezeTicket: number | null = null;
    try {
      // Dos barreras sin await entre ellas: fence bloquea nuevos IPC;
      // freeze bloquea nuevos trabajos instrumentados fuera de la cola.
      freezeTicket = deps.independentActivity.beginFreeze();
      // El timeout externo NO libera el contador: esperar FIN REAL.
      await deps.independentActivity.waitForDrain(freezeTicket);
      await deps.assertNoIndependentSqliteActivity();
      // Un preflight asíncrono no puede levantar la barrera ni admitir
      // trabajos nuevos antes del cierre confirmado del handle principal.
      deps.independentActivity.assertFrozenTicket(freezeTicket);
      const current = deps.inspectQueue();
      if (current.runningOperation !== null || current.queuedOperations !== 0 || current.timedOut) {
        throw new Error('Operaciones SQLite activas durante la cesión.');
      }
      closeAttempted = true;
      await deps.closeMainHandle();
      fence.confirmMainHandleClosed(ticket);
      const ready = await deps.startWriter(ticket);
      if (ready.generation !== ticket) {
        throw new Error('El proceso SQLite auxiliar no coincide con la generación de cesión.');
      }
      // No confiar solo en READY IPC: comprobar lock SMB real antes de
      // publicar ownership worker. La comprobación debe fallar ante corte SMB.
      await deps.verifyWorkerSmbOwnership(ticket);
      deps.independentActivity.assertFrozenTicket(freezeTicket);
      fence.confirmWorkerStarted(ticket);
      // Seguir congelado mientras el worker sea propietario, incluso si
      // posteriormente entra en cuarentena por salida incierta.
      activeFreezeTicket = freezeTicket;
      return ticket;
    } catch (error) {
      if (!closeAttempted) {
        // Único punto de retorno automático seguro. El handle principal
        // todavía está abierto; nunca se ha creado el escritor auxiliar.
        if (freezeTicket !== null) deps.independentActivity.abortFreeze(freezeTicket);
        fence.abortBeforeClose(ticket);
      } else {
        // Mantener la barrera congelada si el cierre/arranque es incierto.
        // Nunca permitir E/S fuera de cola ni volver automáticamente a main.
        activeFreezeTicket = freezeTicket;
      }
      // Tras intentar cerrar, NO hay fallback a main ni apertura automática.
      // El cierre podría haberse producido, o un hijo podría seguir vivo.
      throw error;
    }
  }

  return {
    handoff(): Promise<number> {
      if (pending) return pending;
      const job = performHandoff();
      pending = job;
      void job.then(
        () => { if (pending === job) pending = null; },
        () => { if (pending === job) pending = null; },
      );
      return job;
    },
    /** Registrar ANTES de enviar una escritura. La capa de transporte no reintenta. */
    registerWriterOperation(id: string, generation: number): void {
      assertCurrentWorker(generation);
      // Durable write-ahead record BEFORE the message can be sent.
      deps.durableJournal?.recordSubmitted(id, generation);
      operationLedger.begin(id, generation);
    },
    acknowledgeWriterOperation(id: string, generation: number): void {
      assertCurrentWorker(generation);
      deps.durableJournal?.recordAcknowledged(id, generation);
      operationLedger.acknowledge(id, generation);
    },
    reconcileWriterOperation(id: string, generation: number, evidence?: SqliteReconciliationEvidence): void {
      if (fence.snapshot().owner !== 'quarantine' ||
          fence.snapshot().generation !== generation ||
          confirmedExitGeneration !== generation) {
        throw new Error('Conciliación SQLite requiere cuarentena, generación correcta y exit confirmado.');
      }
      if (deps.durableJournal) {
        if (!evidence) throw new Error('Conciliación durable exige evidencia SQLite explícita.');
        deps.durableJournal.reconcileVerified(id, generation, evidence);
      }
      operationLedger.reconcile(id, generation);
    },
    pendingWriterOperationIds(generation: number): string[] {
      return operationLedger.unsettledIdsForGeneration(generation);
    },
    workerUncertain(generation: number): void {
      fence.markWorkerUncertain(generation);
      deps.durableJournal?.markGenerationUnknown(generation);
      operationLedger.markGenerationUncertain(generation);
    },
    workerExited(generation: number): void {
      fence.markWorkerExited(generation);
      confirmedExitGeneration = generation;
      deps.durableJournal?.markGenerationUnknown(generation);
      operationLedger.markGenerationUncertain(generation);
    },
    restoreMainAfterReconciliation(
      generation: number,
      identityVerified: boolean,
      allUncertainWritesReconciled: boolean,
    ): void {
      // Un booleano del llamador no puede sustituir al libro de operaciones.
      // Rechazar también operaciones en vuelo no marcadas todavía como 'unknown'.
      if (deps.durableJournal?.unsettled().length) {
        throw new Error('Journal durable contiene operaciones de resultado no conciliado, incluso tras reinicio.');
      }
      if (operationLedger.hasUnsettledOperations()) {
        throw new Error('Quedan escrituras SQLite pendientes o de resultado incierto; reconciliar antes de reabrir.');
      }
      if (activeFreezeTicket === null) {
        throw new Error('Cesión sin ticket de actividad independiente; requiere intervención.');
      }
      deps.independentActivity.assertFrozenTicket(activeFreezeTicket);
      fence.restoreMainAfterVerification(
        generation, deps.inspectQueue(), identityVerified, allUncertainWritesReconciled,
      );
      deps.independentActivity.abortFreeze(activeFreezeTicket);
      activeFreezeTicket = null;
      confirmedExitGeneration = null;
    },
  };
}
