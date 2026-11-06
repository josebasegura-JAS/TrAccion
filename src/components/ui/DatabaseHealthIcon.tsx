import { Database } from 'lucide-react';
import type { DatabaseStatusBadgeViewModel } from '../../services/databaseStatusView';

type DatabaseHealthIconProps = {
  status: DatabaseStatusBadgeViewModel;
  className?: string;
};

/** Estado visual compacto. Conserva el diagnóstico accesible sin imprimir SQLite en pantalla. */
export function DatabaseHealthIcon({ status, className = '' }: DatabaseHealthIconProps) {
  const tone = status.tone === 'ok' ? 'ok'
    : status.tone === 'error' ? 'error'
      : 'warning';
  const classes = {
    ok: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
    error: 'border-red-400/30 bg-red-500/10 text-red-300',
  } as const;
  const label = `Estado de base de datos: ${status.label}. ${status.detail}`;
  return (
    <span
      role="status"
      aria-label={label}
      title={status.title}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${classes[tone]} ${className}`}
    >
      <Database size={15} aria-hidden="true" />
    </span>
  );
}
