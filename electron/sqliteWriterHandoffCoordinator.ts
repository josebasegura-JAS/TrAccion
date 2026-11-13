/**
 * PR9D-5A · Contrato de cesión del motor escritor.
 *
 * No se conecta aún al arranque de producción. La única forma válida de
 * activar un worker escritor debe pasar por este coordinador: ninguna apertura
 * en el hijo antes de confirmar cierre de la conexión anterior.
 */
import {
  createSqliteEngineOwnershipFence,
  type SqliteQueueState,
} from './sqliteEngineOwnershipFence.js';

export interface WriterHandoffDependencies {
  /** La cola global y TODOS los trabajos fuera de cola deben estar inactivos. */
  inspectQueue: () => SqliteQueueState;
  /** Aborta si hay backups, migraciones, heartbeat, timer o IO ajena a la cola. */
  assertNoIndependentSqliteActivity: () => Promise<void>;
  /** Resuelve solo si la conexión nativa principal ha cerrado realmente. */
  closeMainHandle: () => Promise<void>;
  /** Resuelve solo cuando el proceso hijo confirma inicio y propiedad única. */
  startWriter: (generation: number) => Promise<{ generation: number }>;
}

export function createSqliteWriterHandoffCoordinator(
  fence: ReturnType<typeof createSqliteEngineOwnershipFence>,
  deps: WriterHandoffDependencies,
) {
  let pending: Promise<number> | null = null;

  async function performHandoff(): Promise<number> {
    // beginHandoff impide admitir operaciones nuevas inmediatamente.
    const ticket = fence.beginHandoff(deps.inspectQueue());
    let closeAttempted = false;
    try {
      await deps.assertNoIndependentSqliteActivity();
      // La comprobación previa es asíncrona: no permitir que un trabajo
      // fuera de cola se inicie entre ella y el cierre. La integración futura
      // debe implementar una barrera de admisión para esos trabajos.
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
      fence.confirmWorkerStarted(ticket);
      return ticket;
    } catch (error) {
      if (!closeAttempted) {
        // Único punto de retorno automático seguro.
        fence.abortBeforeClose(ticket);
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
    workerUncertain(generation: number): void {
      fence.markWorkerUncertain(generation);
    },
    workerExited(generation: number): void {
      fence.markWorkerExited(generation);
    },
    restoreMainAfterReconciliation(
      generation: number,
      identityVerified: boolean,
      allUncertainWritesReconciled: boolean,
    ): void {
      fence.restoreMainAfterVerification(
        generation, deps.inspectQueue(), identityVerified, allUncertainWritesReconciled,
      );
    },
  };
}
