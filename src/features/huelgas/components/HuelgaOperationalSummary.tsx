import { AlertTriangle, BarChart3, CalendarDays, CheckCircle2, ClipboardCheck, MailPlus } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { HuelgaOperationalStatus } from './huelgasOperationalStatus';
import { convocatoriaLabel, formatDate, huelgaStatus, type Huelga } from './huelgasPageModel';

function statusTone(status: HuelgaOperationalStatus): 'success' | 'warning' | 'error' | 'muted' {
  if (status.state === 'validada') return 'success';
  if (status.state === 'incidencias') return 'error';
  if (status.state === 'recogida' || status.state === 'revision') return 'warning';
  return 'muted';
}

export function HuelgaOperationalStatusBadge({ status }: { status: HuelgaOperationalStatus }) {
  return <StatusBadge tone={statusTone(status)} size="xs">{status.label}</StatusBadge>;
}

type Props = {
  huelga: Huelga;
  status: HuelgaOperationalStatus;
  resultsReady: boolean;
  generatingMail: boolean;
  allowResultsNavigation?: boolean;
  onOpenCollectionMails: () => void;
  onOpenResponseCollection: () => void;
  onOpenResults: () => void;
};

export function HuelgaOperationalSummary({
  huelga,
  status,
  resultsReady,
  generatingMail,
  allowResultsNavigation = false,
  onOpenCollectionMails,
  onOpenResponseCollection,
  onOpenResults,
}: Props) {
  const temporalStatus = huelgaStatus(huelga.fecha);
  const isToday = temporalStatus === 'Hoy';
  const receivedPercent = status.total > 0 ? Math.round((status.received / status.total) * 100) : 0;

  return (
    <section className={`rounded-xl border px-4 py-3 ${status.state === 'incidencias' ? 'border-red-500/35 bg-red-500/5' : isToday ? 'border-metro-red/35 bg-metro-red/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className={isToday ? 'text-metro-red' : 'text-amber-300'} size={18} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-metro-muted">
              {isToday ? 'Huelga activa · hoy' : 'Próxima convocatoria'}
            </p>
            <HuelgaOperationalStatusBadge status={status} />
          </div>
          <p className="mt-1 truncate text-base font-semibold text-metro-text">
            {formatDate(huelga.fecha)} · {huelga.sindicatos.join(' · ')}
          </p>
          <p className="mt-0.5 text-xs text-metro-muted">{convocatoriaLabel(huelga)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ActionButton
            variant="secondary"
            size="sm"
            icon={MailPlus}
            iconOnly={false}
            loading={generatingMail}
            onClick={onOpenCollectionMails}
          >
            Comunicaciones
          </ActionButton>
          <ActionButton
            variant={status.state === 'incidencias' || status.state === 'recogida' || status.state === 'revision' ? 'primary' : 'secondary'}
            size="sm"
            icon={ClipboardCheck}
            iconOnly={false}
            onClick={onOpenResponseCollection}
          >
            Recogida
          </ActionButton>
          <ActionButton
            variant="secondary"
            size="sm"
            icon={BarChart3}
            iconOnly={false}
            disabled={!resultsReady && !allowResultsNavigation}
            title={resultsReady ? 'Abrir resultados ejecutivos' : allowResultsNavigation ? 'Abrir la sección de resultados' : 'Disponible cuando la recogida esté validada y sin errores'}
            onClick={onOpenResults}
          >
            Resultados
          </ActionButton>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Recibidos</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-metro-text">{status.received}/{status.total}</p>
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Revisados</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-metro-text">{status.reviewed}/{status.total}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${status.errors > 0 ? 'border-red-500/35 bg-red-500/8' : 'border-metro-border bg-metro-panel/45'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Errores</p>
          <p className={`mt-0.5 flex items-center gap-1.5 text-lg font-bold tabular-nums ${status.errors > 0 ? 'text-red-300' : 'text-metro-text'}`}>
            {status.errors > 0 ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}{status.errors}
          </p>
        </div>
        <div className="rounded-lg border border-metro-border bg-metro-panel/45 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Advertencias</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-metro-text">{status.warnings}</p>
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-metro-raised" aria-label={`Recepción ${receivedPercent}%`}>
        <div className="h-full rounded-full bg-metro-red" style={{ width: `${receivedPercent}%` }} />
      </div>

      {status.state === 'incidencias' && (
        <p className="mt-2 text-xs font-medium text-red-300">
          Hay {status.errors} incidencia{status.errors === 1 ? '' : 's'} bloqueante{status.errors === 1 ? '' : 's'} que debes corregir antes de validar los resultados.
        </p>
      )}
    </section>
  );
}
