/**
 * PR9D-3 · Barrera local de propiedad del motor SQLite.
 *
 * Esta barrera es DEL PROCESO ELECTRON, no un lock distribuido entre equipos.
 * El lock SMB y la cola IPC siguen siendo imprescindibles.
 *
 * Preparación para el futuro traspaso del HANDLE escritor al utilityProcess:
 * en un instante solo puede existir un propietario lógico. Una salida incierta
 * del worker entra en quarantine y NUNCA hace fallback automático a main.
 */
export type SqliteEngineOwner = 'main' | 'draining' | 'worker' | 'quarantine';
export type SqliteEngineOwnerSnapshot = Readonly<{ owner: SqliteEngineOwner; generation: number }>;

export interface SqliteQueueState {
  queuedOperations: number;
  runningOperation: string | null;
  timedOut: boolean;
}

function assertIdleQueue(queue: SqliteQueueState): void {
  if (queue.runningOperation !== null || queue.queuedOperations !== 0 || queue.timedOut) {
    throw new Error('No se puede ceder SQLite con operaciones en curso, pendientes o indeterminadas.');
  }
}

export function createSqliteEngineOwnershipFence() {
  let owner: SqliteEngineOwner = 'main';
  let generation = 0;
  let workerExitConfirmed = false;

  return {
    snapshot(): SqliteEngineOwnerSnapshot {
      return { owner, generation };
    },
    assertMayEnterMain(): void {
      if (owner !== 'main') {
        throw new Error('Motor SQLite no disponible en Electron: propiedad cedida o resultado incierto.');
      }
    },
    beginHandoff(queue: SqliteQueueState): number {
      if (owner !== 'main') throw new Error('La cesión de SQLite ya está iniciada o suspendida.');
      assertIdleQueue(queue);
      owner = 'draining';
      workerExitConfirmed = false;
      generation += 1;
      return generation;
    },
    abortBeforeClose(ticket: number): void {
      if (owner !== 'draining' || ticket !== generation) {
        throw new Error('No se puede cancelar una cesión SQLite ya completada o de otra generación.');
      }
      owner = 'main'; // solo antes de cerrar main y antes de crear worker
    },
    confirmMainClosedAndWorkerStarted(ticket: number): void {
      if (owner !== 'draining' || ticket !== generation) {
        throw new Error('No se puede activar el worker sin cerrar primero el handle principal.');
      }
      owner = 'worker';
    },
    markWorkerUncertain(ticket: number): void {
      if (owner !== 'worker' || ticket !== generation) {
        throw new Error('Generación/proceso SQLite inesperado.');
      }
      owner = 'quarantine';
    },
    markWorkerExited(ticket: number): void {
      if ((owner !== 'worker' && owner !== 'quarantine') || ticket !== generation) {
        throw new Error('Salida SQLite no pertenece al worker vigente.');
      }
      // El proceso puede haber tenido un guardado de resultado incierto.
      // Mantener quarantine, incluso si exit(0), hasta reconciliación.
      owner = 'quarantine';
      workerExitConfirmed = true;
    },
    restoreMainAfterVerification(ticket: number, queue: SqliteQueueState, identityVerified: boolean,
      uncertainWritesReconciled: boolean): void {
      if (owner !== 'quarantine' || ticket !== generation) {
        throw new Error('Se requiere terminación confirmada y cuarentena del worker actual.');
      }
      if (!workerExitConfirmed) throw new Error('No se ha confirmado la salida del worker anterior.');
      assertIdleQueue(queue);
      if (!identityVerified || !uncertainWritesReconciled) {
        throw new Error('SQLite no puede rehabilitarse sin identidad y escrituras inciertas reconciliadas.');
      }
      owner = 'main';
      workerExitConfirmed = false;
    },
  };
}

/** En PR9D-3 no existe cesión en runtime: la barrera protege la entrada
 * al motor actual. El protocolo de cesión se activará cuando todos los
 * repositorios estén operando por la misma fachada worker. */
export const sqliteEngineOwnershipFence = createSqliteEngineOwnershipFence();
