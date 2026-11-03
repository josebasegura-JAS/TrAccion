/**
 * Textos de recuperación para personas usuarias. No interpreta un simple
 * cambio de red como prueba de conexión válida con SQLite.
 */
export type ConnectionProblem = 'disk-io' | 'timeout' | 'locked' | 'path' | 'unknown';

export function classifyConnectionProblem(message: string | null): ConnectionProblem {
  const value = (message ?? '').toLowerCase();
  if (/disk i\/?o error|sqlite_ioerr|error de e\/s|entrada\/salida/.test(value)) return 'disk-io';
  if (/timeout|tiempo de espera|superó .* s\.|indeterminad|sigue en curso/.test(value)) return 'timeout';
  if (/database is locked|base ocupada|bloqueo temporal|sqlite_busy/.test(value)) return 'locked';
  if (/enoent|no se encuentra la base|ruta configurada|carpeta compartida.*no disponible/.test(value)) return 'path';
  return 'unknown';
}

export function connectionProblemExplanation(message: string | null): string {
  switch (classifyConnectionProblem(message)) {
    case 'disk-io':
      return 'SQLite ha dejado de poder leer o escribir en la base compartida. Aunque vuelva la red, hay que verificar de nuevo la conexión con la base.';
    case 'timeout':
      return 'Una operación está tardando demasiado o su resultado es incierto. No conviene repetir un guardado hasta confirmar qué ocurrió.';
    case 'locked':
      return 'La base está ocupada temporalmente. TrAcción seguirá comprobando si puede recuperar el acceso.';
    case 'path':
      return 'No se ha podido acceder a la ubicación configurada de la base de datos. Comprueba que la carpeta de red está disponible.';
    default:
      return 'TrAcción no puede confirmar el acceso seguro a la base compartida. Se seguirá comprobando la conexión antes de permitir cambios.';
  }
}

export interface ConnectionReportInput {
  phase: string;
  attempt: number;
  checking: boolean;
  consecutiveFailures: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  lastCheckDurationMs: number | null;
  lastError: string | null;
}

export function buildConnectionReport(input: ConnectionReportInput): string {
  return [
    'Diagnóstico de conexión TrAcción',
    `Estado: ${input.phase}`,
    `Intento mostrado: ${input.attempt}`,
    `Comprobación en curso: ${input.checking ? 'sí' : 'no'}`,
    `Fallos consecutivos: ${input.consecutiveFailures}`,
    `Última comprobación correcta: ${input.lastSuccessAt ?? 'no registrada'}`,
    `Último fallo: ${input.lastFailureAt ?? 'no registrado'}`,
    `Duración última comprobación: ${input.lastCheckDurationMs ?? 'sin dato'} ms`,
    `Tipo de incidencia: ${classifyConnectionProblem(input.lastError)}`,
    `Error técnico: ${input.lastError ?? 'no disponible'}`,
    'Nota: no incluye ni comprueba el estado final de operaciones de guardado previas.',
  ].join('\n');
}
