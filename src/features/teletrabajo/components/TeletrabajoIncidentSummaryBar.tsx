import type { TeletrabajoIncidentFilter } from '../domain/incidentView';

interface TeletrabajoIncidentStats {
  total: number;
  notReviewed: number;
  reviewedPending: number;
  conflicts: number;
  blocked: number;
  readyToApprove: number;
}

const FILTER_ITEMS: Array<{
  key: TeletrabajoIncidentFilter;
  label: string;
  stat: keyof TeletrabajoIncidentStats;
  className: string;
}> = [
  { key: '', label: 'Todas', stat: 'total', className: 'border-metro-border text-metro-text' },
  { key: 'sinRevisar', label: 'Sin revisar', stat: 'notReviewed', className: 'border-amber-400/40 text-amber-100' },
  { key: 'revisadasPendientes', label: 'Revisadas pendientes', stat: 'reviewedPending', className: 'border-amber-400/40 text-amber-100' },
  { key: 'conflictos', label: 'Con incidencias', stat: 'conflicts', className: 'border-amber-400/40 text-amber-100' },
  { key: 'bloqueantes', label: 'Bloqueantes', stat: 'blocked', className: 'border-red-400/40 text-red-100' },
  { key: 'listasAprobar', label: 'Listas para aprobar', stat: 'readyToApprove', className: 'border-emerald-400/40 text-emerald-100' },
];

export function TeletrabajoIncidentSummaryBar({
  activeFilter,
  onChange,
  stats,
}: {
  activeFilter: TeletrabajoIncidentFilter;
  onChange: (filter: TeletrabajoIncidentFilter) => void;
  stats: TeletrabajoIncidentStats;
}) {
  return (
    <div className="mb-3 flex flex-nowrap gap-1.5 overflow-x-auto">
      {FILTER_ITEMS.map((item) => {
        const isActive = activeFilter === item.key;
        return (
          <button
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border bg-metro-surface px-2.5 py-1.5 text-xs font-semibold transition hover:border-metro-red ${item.className} ${
              isActive ? 'ring-2 ring-metro-red/60' : ''
            }`}
            key={item.label}
            onClick={() => onChange(item.key)}
            type="button"
          >
            <span className="text-metro-muted">{item.label}</span>
            <span className="font-black">{stats[item.stat]}</span>
          </button>
        );
      })}
    </div>
  );
}
