import type { DatabaseConnectivityPhase } from './databaseConnectivityState';
import type { DatabaseStatusBadgeViewModel } from './databaseStatusView';

/**
 * Estado visual del editor, sin modificar el estado real de persistencia.
 * La conectividad tiene prioridad sobre un snapshot de SQLite todavía "ready".
 */
export function resolveEditorDatabaseIndicator(
  status: DatabaseStatusBadgeViewModel,
  phase: DatabaseConnectivityPhase,
  connectivityBlocked: boolean,
  connectionMessage: string,
): DatabaseStatusBadgeViewModel {
  if (connectivityBlocked || phase === 'reconnecting' || phase === 'syncing') {
    const label = phase === 'syncing' ? 'Recuperando datos compartidos' : 'Reconectando base de datos';
    return {
      ...status,
      label,
      detail: connectionMessage || 'La conexión compartida está en recuperación.',
      title: `${label}. ${connectionMessage || 'La edición continúa protegida hasta comprobar la conexión.'}`,
      tone: 'warning',
      requiresAttention: true,
    };
  }
  return status;
}
