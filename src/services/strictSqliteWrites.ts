import { SQLITE_PENDING_RECORD_WRITES_KEY } from './persistenceKeys';

export interface StrictSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

function clearLegacyPendingRecordWrites(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SQLITE_PENDING_RECORD_WRITES_KEY);
}

/**
 * Ejecuta un guardado estricto contra la SQLite compartida.
 * Un cambio solo es válido cuando SQLite lo confirma: nunca se encola ni se
 * persiste localmente para reintentarlo más tarde.
 */
export async function saveSharedRecord(
  save: () => Promise<StrictSqliteSaveResult | null>,
): Promise<StrictSqliteSaveResult> {
  // Limpieza de compatibilidad para instalaciones que aún conserven la antigua
  // cola offline de versiones previas a la arquitectura SQLite autoritativa.
  clearLegacyPendingRecordWrites();

  try {
    const result = await save();
    if (result === null) {
      return {
        ok: false,
        message: 'Repositorio SQLite no disponible. El cambio no se ha guardado.',
        currentUpdatedAt: null,
      };
    }

    if (result.ok) {
      return result;
    }

    const normalizedMessage = result.message.toLowerCase();
    const isConcurrencyConflict =
      result.currentUpdatedAt !== null ||
      normalizedMessage.includes('modificado por otro usuario') ||
      normalizedMessage.includes('modificada por otro usuario');

    // Los conflictos OCC son rechazos válidos de SQLite, no fallos de conexión.
    // Se propagan intactos para que el store pueda recargar el dato vigente.
    if (isConcurrencyConflict) {
      return result;
    }

    return {
      ...result,
      message: `${result.message} El cambio NO se ha guardado localmente. Recupera la conexión con SQLite antes de continuar.`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de conexión con SQLite.';
    return {
      ok: false,
      message: `${message} El cambio NO se ha guardado localmente. Recupera la conexión con SQLite antes de continuar.`,
      currentUpdatedAt: null,
    };
  }
}
