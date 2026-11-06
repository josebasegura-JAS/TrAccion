export type DatabaseStatusTone = 'ok' | 'warning' | 'error' | 'locked' | 'unknown';

export interface DatabaseStatusBadgeViewModel {
  label: string;
  detail: string;
  title: string;
  tone: DatabaseStatusTone;
  requiresAttention: boolean;
}

function fallbackPath(status: TraccionDatabaseStatus | null): string {
  return status?.path ?? 'ruta de base de datos no confirmada';
}

export function buildDatabaseStatusBadge(
  status: TraccionDatabaseStatus | null,
): DatabaseStatusBadgeViewModel {
  if (!status) {
    return {
      label: 'Base de datos no disponible',
      detail: 'edición bloqueada',
      title: 'Base de datos: estado Base de datos no disponible. La edición permanece bloqueada hasta recuperar la base compartida.',
      tone: 'unknown',
      requiresAttention: true,
    };
  }

  if (status.ready) {
    if (status.isDefaultPath !== false) {
      return {
        label: 'Base de datos no compartida',
        detail: 'ruta local no permitida',
        title: `Base de datos: la ruta local no es válida para trabajar. Configura la base de datos compartida en Ajustes. Ruta detectada: ${fallbackPath(status)}`,
        tone: 'warning',
        requiresAttention: true,
      };
    }

    const routeKind = 'ruta personalizada/compartida';

    if (status.message?.toLowerCase().includes('bloquean nuevas escrituras')) {
      return {
        label: 'Base de datos solo lectura',
        detail: status.message,
        title: `Base de datos: Base de datos activa, pero con escrituras bloqueadas. Ruta: ${fallbackPath(status)}. ${status.message}`,
        tone: 'warning',
        requiresAttention: true,
      };
    }

    return {
      label: 'Base de datos activa',
      detail: routeKind,
      title: `Base de datos: Base de datos activa (${routeKind}). Ruta: ${fallbackPath(status)}`,
      tone: 'ok',
      requiresAttention: false,
    };
  }

  if (status.phase === 'locked') {
    const lockOwner = status.lock
      ? ` Lock: ${status.lock.username}@${status.lock.hostname} · PID ${status.lock.pid}`
      : '';
    return {
      label: 'Base de datos ocupada',
      detail: status.message ?? 'base bloqueada temporalmente',
      title: `Base de datos: Base de datos ocupada. Ruta: ${fallbackPath(status)}.${lockOwner}`,
      tone: 'locked',
      requiresAttention: true,
    };
  }

  if (status.phase === 'fallback') {
    return {
      label: 'Base de datos no disponible',
      detail: status.message ?? 'Base de datos inactiva',
      title: `Base de datos: Base de datos no disponible. Edición bloqueada. Ruta prevista: ${fallbackPath(status)}. ${status.message ?? ''}`,
      tone: 'warning',
      requiresAttention: true,
    };
  }

  if (status.phase === 'error') {
    return {
      label: 'Error de base de datos',
      detail: status.message ?? 'ruta no accesible',
      title: `Base de datos: error de base de datos. Ruta: ${fallbackPath(status)}. ${status.message ?? ''}`,
      tone: 'error',
      requiresAttention: true,
    };
  }

  return {
    label: 'Base de datos inactiva',
    detail: status.message ?? 'ruta no accesible',
    title: `Base de datos: Base de datos inactiva. Ruta: ${fallbackPath(status)}. ${status.message ?? ''}`,
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
