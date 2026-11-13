/**
 * PR9D-5E · Preparación de traspaso: pausar primero el heartbeat y
 * después congelar/drenar E/S extracola. Sin conexión al runtime.
 *
 * No autoriza el cierre de SQLite ni el inicio de un segundo escritor:
 * únicamente prepara y libera el preflight instrumentado de PR9D-5D.
 */
export interface SqliteHeartbeatHandoffDependencies {
  pauseHeartbeatAndDrain: () => Promise<void>;
  resumeHeartbeat: () => void;
  freezeAndDrainOtherActivity: () => Promise<number>;
  abortOtherActivityFreeze: (ticket: number) => void;
}

export function createSqliteHeartbeatHandoffPreparation(deps: SqliteHeartbeatHandoffDependencies) {
  let state: 'idle' | 'pausing' | 'prepared' = 'idle';
  let preparedTicket: number | null = null;

  return {
    async prepare(): Promise<number> {
      if (state !== 'idle') throw new Error('La pausa SQLite ya está iniciada.');
      state = 'pausing';
      try {
        await deps.pauseHeartbeatAndDrain();
        const ticket = await deps.freezeAndDrainOtherActivity();
        preparedTicket = ticket;
        state = 'prepared';
        return ticket;
      } catch (error) {
        // El preflight de freeze se encarga de abortar su propia reserva
        // cuando no ha llegado a completar. Reanudar el heartbeat.
        state = 'idle';
        deps.resumeHeartbeat();
        throw error;
      }
    },
    /** Solo antes de llamar a closeMainHandle(). */
    abortBeforeClose(ticket: number): void {
      if (state !== 'prepared' || preparedTicket !== ticket) {
        throw new Error('Ticket de pausa/cesión SQLite obsoleto.');
      }
      deps.abortOtherActivityFreeze(ticket);
      preparedTicket = null;
      state = 'idle';
      deps.resumeHeartbeat();
    },
    /** No es seguro reanudar aquí: el escritor puede haber cerrado. */
    assertPrepared(ticket: number): void {
      if (state !== 'prepared' || preparedTicket !== ticket) {
        throw new Error('La preparación del heartbeat SQLite no está vigente.');
      }
    },
  };
}
