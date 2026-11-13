/**
 * PR9D-5D · Preflight de admisión de E/S instrumentada.
 *
 * No sustituye al bloqueo SMB ni a la barrera de propiedad del motor.
 * Es un componente aislado para el futuro handoff: NO se invoca desde main.
 */
import type { SqliteQueueState } from './sqliteEngineOwnershipFence.js';
import { createSqliteIndependentActivityTracker } from './sqliteIndependentActivityTracker.js';

export interface DrainBackupState {
  timerScheduled: boolean;
  pendingReason: boolean;
  pendingRevision: boolean;
  workRunning: boolean;
}

type Tracker = ReturnType<typeof createSqliteIndependentActivityTracker>;
export function createSqliteWriterDrainPreflight(
  tracker: Tracker,
  readQueue: () => SqliteQueueState,
  readBackups: () => DrainBackupState,
) {
  function assertOtherSourcesIdle(): void {
    const queue = readQueue();
    if (queue.queuedOperations > 0 || queue.runningOperation !== null || queue.timedOut) {
      throw new Error('Hay operaciones en cola SQLite o resultados indeterminados.');
    }
    const backup = readBackups();
    if (backup.timerScheduled || backup.pendingReason || backup.pendingRevision || backup.workRunning) {
      throw new Error('Existen copias SQLite programadas, pendientes o en ejecución.');
    }
  }

  return {
    /** Reserva admisión sincrónicamente antes de cualquier await. */
    async prepare(): Promise<number> {
      const ticket = tracker.beginFreeze();
      try {
        await tracker.waitForDrain(ticket);
        assertOtherSourcesIdle();
        tracker.assertIdle();
        return ticket;
      } catch (error) {
        // Solo es válido aquí: este preflight NO cierra el handle ni crea worker.
        tracker.abortFreeze(ticket);
        throw error;
      }
    },
    assertPrepared(ticket: number): void {
      if (!tracker.snapshot().frozen) {
        throw new Error('No se ha detenido la admisión de E/S SQLite.');
      }
      // waitForDrain valida que el ticket corresponde a la congelación actual.
      // Este método se llama desde un coordinador que debe mantener el ticket.
      tracker.assertIdle();
      assertOtherSourcesIdle();
      if (!Number.isSafeInteger(ticket) || ticket < 1) {
        throw new Error('Ticket de preparación SQLite inválido.');
      }
    },
    abortBeforeClose(ticket: number): void {
      tracker.abortFreeze(ticket);
    },
  };
}
