/**
 * PR9D-5D · Barrera de admisión para E/S SQLite/SMB instrumentada.
 *
 * Una congelación rechaza nuevas entradas de los caminos instrumentados y
 * espera a la terminación REAL de las ya admitidas. No cancela escrituras ni
 * permite que un timeout externo libere reservas prematuramente.
 *
 * Importante: todavía NO abarca todos los accesos SQLite ni autoriza
 * iniciar la cesión real del escritor. El runtime no invoca beginFreeze().
 */
export interface SqliteIndependentActivitySnapshot {
  active: number;
  labels: string[];
  frozen: boolean;
}

export function createSqliteIndependentActivityTracker() {
  let nextId = 1;
  let generation = 0;
  let frozenGeneration: number | null = null;
  const active = new Map<number, string>();
  const drainWaiters = new Set<() => void>();

  function notifyDrained(): void {
    if (active.size !== 0) return;
    for (const resolve of drainWaiters) resolve();
    drainWaiters.clear();
  }

  function assertAdmitting(): void {
    if (frozenGeneration !== null) {
      throw new Error('E/S SQLite/SMB suspendida por una cesión del motor aún no confirmada.');
    }
  }

  return {
    snapshot(): SqliteIndependentActivitySnapshot {
      return { active: active.size, labels: [...active.values()], frozen: frozenGeneration !== null };
    },
    assertAdmitting,
    assertIdle(): void {
      if (active.size > 0) {
        throw new Error('No se puede ceder SQLite: sigue activa E/S independiente de la cola IPC.');
      }
    },
    /**
     * Reserva la exclusividad ANTES del primer await. No es un lock
     * distribuido: los demás equipos siguen coordinándose por .lockdir.
     */
    beginFreeze(): number {
      assertAdmitting();
      frozenGeneration = ++generation;
      return frozenGeneration;
    },
    /** Espera a que las promesas admitidas antes del freeze hayan terminado. */
    waitForDrain(ticket: number): Promise<void> {
      if (frozenGeneration !== ticket) {
        return Promise.reject(new Error('Ticket de drenaje SQLite inválido u obsoleto.'));
      }
      if (active.size === 0) return Promise.resolve();
      return new Promise<void>((resolve) => { drainWaiters.add(resolve); });
    },
    /**
     * Solo puede abortarse ANTES del cierre del handle, usando el ticket
     * vigente. El coordinador de cesión determina si está permitido.
     */
    abortFreeze(ticket: number): void {
      if (frozenGeneration !== ticket) {
        throw new Error('No se puede reabrir admisión SQLite: ticket obsoleto.');
      }
      frozenGeneration = null;
      notifyDrained();
    },
    async run<T>(label: string, operation: () => T | Promise<T>): Promise<T> {
      if (!label.trim()) throw new Error('Operación SQLite sin etiqueta.');
      assertAdmitting();
      const id = nextId++;
      active.set(id, label);
      try {
        return await operation();
      } finally {
        active.delete(id);
        notifyDrained();
      }
    },
  };
}

export const sqliteIndependentActivityTracker = createSqliteIndependentActivityTracker();
