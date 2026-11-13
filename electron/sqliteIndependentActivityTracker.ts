/**
 * PR9D-5B · Contador de acceso SQLite/SMB fuera del mecanismo IPC.
 *
 * Instrumentación no invasiva: en esta fase NO habilita el traspaso del
 * escritor. Cuenta también la espera del lock: ninguna cesión puede asumir
 * que una operación ya terminada por timeout dejó de acceder a SMB.
 */
export interface SqliteIndependentActivitySnapshot {
  active: number;
  labels: string[];
}
export function createSqliteIndependentActivityTracker() {
  let nextId = 1;
  const active = new Map<number, string>();

  return {
    snapshot(): SqliteIndependentActivitySnapshot {
      return { active: active.size, labels: [...active.values()] };
    },
    assertIdle(): void {
      if (active.size > 0) {
        throw new Error('No se puede ceder SQLite: sigue activa E/S independiente de la cola IPC.');
      }
    },
    async run<T>(label: string, operation: () => T | Promise<T>): Promise<T> {
      if (!label.trim()) throw new Error('Operación SQLite sin etiqueta.');
      const id = nextId++;
      active.set(id, label);
      try {
        return await operation();
      } finally {
        active.delete(id);
      }
    },
  };
}

export const sqliteIndependentActivityTracker = createSqliteIndependentActivityTracker();
