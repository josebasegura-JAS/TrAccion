export type DatabaseStatusTone = 'ok' | 'warning' | 'error' | 'locked' | 'unknown';

export interface DatabaseStatusBadgeViewModel {
  label: string;
  detail: string;
  title: string;
  tone: DatabaseStatusTone;
  requiresAttention: boolean;
}

function fallbackPath(status: TraccionDatabaseStatus | null): string {
  return status?.path ?? 'localStorage local';
}

export function buildDatabaseStatusBadge(
  status: TraccionDatabaseStatus | null,
): DatabaseStatusBadgeViewModel {
  if (!status) {
    return {
      label: 'Fallback localStorage',
      detail: 'Estado SQLite no disponible',
      title: 'Base de datos: fallback localStorage. No se ha podido leer el estado SQLite.',
      tone: 'unknown',
      requiresAttention: true,
    };
  }

  if (status.ready) {
    const routeKind = status.isDefaultPath ? 'ruta local por defecto' : 'ruta personalizada/compartida';

    if (status.message?.toLowerCase().includes('bloquean nuevas escrituras')) {
      return {
        label: 'SQLite solo lectura',
        detail: status.message,
        title: `Base de datos: SQLite activo, pero con escrituras bloqueadas. Ruta: ${fallbackPath(status)}. ${status.message}`,
        tone: 'warning',
        requiresAttention: true,
      };
    }

    return {
      label: 'SQLite activo',
      detail: routeKind,
      title: `Base de datos: SQLite activo (${routeKind}). Ruta: ${fallbackPath(status)}`,
      tone: 'ok',
      requiresAttention: false,
    };
  }

  if (status.phase === 'locked') {
    const lockOwner = status.lock
      ? ` Lock: ${status.lock.username}@${status.lock.hostname} · PID ${status.lock.pid}`
      : '';
    return {
      label: 'SQLite ocupado',
      detail: status.message ?? 'base bloqueada temporalmente',
      title: `Base de datos: SQLite ocupado. Ruta: ${fallbackPath(status)}.${lockOwner}`,
      tone: 'locked',
      requiresAttention: true,
    };
  }

  if (status.phase === 'fallback') {
    return {
      label: 'Fallback localStorage',
      detail: status.message ?? 'SQLite no activo',
      title: `Base de datos: fallback localStorage. Ruta prevista: ${fallbackPath(status)}. ${status.message ?? ''}`,
      tone: 'warning',
      requiresAttention: true,
    };
  }

  if (status.phase === 'error') {
    return {
      label: 'SQLite error',
      detail: status.message ?? 'ruta no accesible',
      title: `Base de datos: error SQLite. Ruta: ${fallbackPath(status)}. ${status.message ?? ''}`,
      tone: 'error',
      requiresAttention: true,
    };
  }

  return {
    label: 'SQLite no activo',
    detail: status.message ?? 'ruta no accesible',
    title: `Base de datos: SQLite no activo. Ruta: ${fallbackPath(status)}. ${status.message ?? ''}`,
    tone: 'error',
    requiresAttention: true,
  };
}

export function databaseStatusBadgeClassName(tone: DatabaseStatusTone): string {
  if (tone === 'ok') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200';
  }

  if (tone === 'locked') {
    return 'border-slate-400/30 bg-slate-400/10 text-slate-200';
  }

  if (tone === 'error') {
    return 'border-red-500/30 bg-red-500/10 text-red-200';
  }

  return 'border-amber-400/30 bg-amber-400/10 text-amber-100';
}
