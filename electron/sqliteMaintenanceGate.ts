/**
 * Barrera común para las operaciones de mantenimiento que siguen teniendo
 * acceso directo al handle SQLite del proceso principal.
 *
 * El tracker observa TODA la operación (incluso la espera del lock local y
 * el trabajo posterior). El freeze de cesión impide nuevas admisiones;
 * una operación ya admitida mantiene la reserva hasta terminar realmente.
 */
export interface SqliteMaintenanceGateDependencies {
  track<T>(label: string, operation: () => T | Promise<T>): Promise<T>;
  withExclusiveLock<T>(databasePath: string, operation: () => Promise<T>): Promise<T>;
}

export function createSqliteMaintenanceGate(dependencies: SqliteMaintenanceGateDependencies) {
  return {
    run<T>(label: string, operation: () => T | Promise<T>): Promise<T> {
      if (!label.trim()) return Promise.reject(new Error('Mantenimiento SQLite sin identificador.'));
      return dependencies.track(`sqlite:maintenance:${label}`, operation);
    },
    runExclusive<T>(
      label: string,
      databasePath: string,
      operation: () => Promise<T>,
    ): Promise<T> {
      if (!label.trim() || !databasePath.trim()) {
        return Promise.reject(new Error('Mantenimiento SQLite exclusivo sin ruta o identificador.'));
      }
      // La reserva comienza antes de intentar la exclusión, de manera que
      // un handoff concurrente espera incluso a una adquisición SMB lenta.
      return dependencies.track(`sqlite:maintenance:${label}`, () =>
        dependencies.withExclusiveLock(databasePath, operation),
      );
    },
  };
}
