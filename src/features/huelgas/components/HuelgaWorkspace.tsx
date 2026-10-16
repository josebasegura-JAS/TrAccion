import type { ReactNode } from 'react';
import { ArrowLeft, BarChart3, CheckCircle2, ClipboardCheck, MailPlus, Pencil, TriangleAlert } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { HuelgaOperationalStatusBadge } from './HuelgaOperationalSummary';
import type { HuelgaOperationalStatus } from './huelgasOperationalStatus';
import { convocatoriaLabel, formatDate, huelgaStatus, type Huelga } from './huelgasPageModel';

export type HuelgaWorkspaceTab = 'resumen' | 'comunicaciones' | 'recogida' | 'resultados';

type Props = {
  huelga: Huelga;
  activeTab: HuelgaWorkspaceTab;
  status: HuelgaOperationalStatus;
  resultsReady: boolean;
  generatingMail: boolean;
  collectionContent?: ReactNode;
  resultsContent?: ReactNode;
  onTabChange: (tab: HuelgaWorkspaceTab) => void;
  onBack: () => void;
  onEdit: () => void;
  onOpenCollectionMails: () => void;
  onOpenResponseCollection: () => void;
};

const TABS: Array<{ id: HuelgaWorkspaceTab; label: string; icon: typeof MailPlus }> = [
  { id: 'resumen', label: 'Resumen', icon: CheckCircle2 },
  { id: 'comunicaciones', label: 'Comunicaciones', icon: MailPlus },
  { id: 'recogida', label: 'Recogida', icon: ClipboardCheck },
  { id: 'resultados', label: 'Resultados', icon: BarChart3 },
];

function statusMessage(status: HuelgaOperationalStatus): string {
  if (status.state === 'incidencias') return `Hay ${status.errors} error${status.errors === 1 ? '' : 'es'} bloqueante${status.errors === 1 ? '' : 's'} pendiente${status.errors === 1 ? '' : 's'} de corrección.`;
  if (status.state === 'validada') return 'La recogida está revisada y los datos pueden utilizarse para resultados.';
  if (status.state === 'revision') return 'Todos los circuitos están recibidos; quedan circuitos pendientes de revisión.';
  if (status.state === 'recogida') return 'La recogida está en curso y todavía faltan respuestas de algunos circuitos.';
  return 'La convocatoria está preparada y todavía no se han recibido datos de seguimiento.';
}

export function HuelgaWorkspace({
  huelga,
  activeTab,
  status,
  resultsReady,
  generatingMail,
  collectionContent,
  resultsContent,
  onTabChange,
  onBack,
  onEdit,
  onOpenCollectionMails,
  onOpenResponseCollection,
}: Props) {
  const temporal = huelgaStatus(huelga.fecha);
  const prepared = Object.keys(huelga.correosPreparadosPorZona ?? {}).length;

  return (
    <div className="space-y-2.5">
      <section className="rounded-xl border border-metro-border bg-metro-panel/45 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <ActionButton variant="secondary" size="sm" icon={ArrowLeft} iconOnly onClick={onBack} title="Volver al listado de huelgas" />
              <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Gestión de huelga</p>
              {temporal !== 'Finalizada' && <StatusBadge tone={temporal === 'Hoy' ? 'error' : 'warning'} size="xs">{temporal}</StatusBadge>}
              <HuelgaOperationalStatusBadge status={status} />
            </div>
            <h2 className="mt-1 truncate text-base font-bold text-metro-text" title={`${formatDate(huelga.fecha)} · ${huelga.sindicatos.join(' · ')}`}>
              {formatDate(huelga.fecha)} · {huelga.sindicatos.join(' · ')}
            </h2>
            <p className="mt-0.5 truncate text-[11px] text-metro-muted" title={`${convocatoriaLabel(huelga)}${huelga.observaciones ? ` · ${huelga.observaciones}` : ''}`}>
              {convocatoriaLabel(huelga)}{huelga.observaciones ? ` · ${huelga.observaciones}` : ''}
            </p>
          </div>
          <ActionButton variant="edit" size="sm" icon={Pencil} iconOnly={false} onClick={onEdit}>Editar</ActionButton>
        </div>

        <div className="mt-2 overflow-x-auto border-t border-metro-border pt-2" role="tablist" aria-label="Secciones de la huelga">
          <div className="flex min-w-max items-center gap-1">
            {TABS.map(({ id, label, icon: Icon }) => {
              const selected = activeTab === id;
              const badge = id === 'recogida' && status.errors > 0 ? status.errors : null;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onTabChange(id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${selected ? 'bg-metro-red text-white' : 'text-metro-muted hover:bg-metro-raised hover:text-metro-text'}`}
                >
                  <Icon size={13} />
                  {label}
                  {badge ? <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${selected ? 'bg-white/20 text-white' : 'bg-red-500/15 text-red-300'}`}>{badge}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {activeTab === 'resumen' && (
        <section className="grid gap-2.5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Estado operativo</p>
                <div className="mt-1"><HuelgaOperationalStatusBadge status={status} /></div>
              </div>
              {status.errors > 0 ? <TriangleAlert className="text-red-300" size={22} /> : <CheckCircle2 className="text-emerald-300" size={22} />}
            </div>
            <p className="mt-2 text-xs text-metro-text">{statusMessage(status)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2"><p className="text-[9px] uppercase text-metro-muted">Recibidos</p><strong className="text-base tabular-nums text-metro-text">{status.received}/{status.total}</strong></div>
              <div className="rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2"><p className="text-[9px] uppercase text-metro-muted">Revisados</p><strong className="text-base tabular-nums text-metro-text">{status.reviewed}/{status.total}</strong></div>
              <div className="rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2"><p className="text-[9px] uppercase text-metro-muted">Errores</p><strong className={status.errors > 0 ? 'text-base tabular-nums text-red-300' : 'text-base tabular-nums text-metro-text'}>{status.errors}</strong></div>
              <div className="rounded-lg border border-metro-border bg-metro-panel px-2.5 py-2"><p className="text-[9px] uppercase text-metro-muted">Avisos</p><strong className="text-base tabular-nums text-metro-text">{status.warnings}</strong></div>
            </div>
          </div>

          <div className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Siguiente acción</p>
            <p className="mt-1.5 text-sm font-semibold text-metro-text">
              {status.state === 'preparacion' ? 'Preparar comunicaciones' : status.state === 'validada' ? 'Consultar resultados' : 'Continuar recogida'}
            </p>
            <p className="mt-1 text-[11px] text-metro-muted">Comunicaciones preparadas: {prepared}. Resultados: {resultsReady ? 'disponibles' : 'pendientes de validación'}.</p>
            <div className="mt-3">
              {status.state === 'preparacion' ? (
                <ActionButton variant="primary" icon={MailPlus} iconOnly={false} loading={generatingMail} onClick={onOpenCollectionMails}>Abrir comunicaciones</ActionButton>
              ) : status.state === 'validada' && resultsReady ? (
                <ActionButton variant="primary" icon={BarChart3} iconOnly={false} onClick={() => onTabChange('resultados')}>Ver resultados</ActionButton>
              ) : (
                <ActionButton variant="primary" icon={ClipboardCheck} iconOnly={false} onClick={onOpenResponseCollection}>Ir a recogida</ActionButton>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === 'comunicaciones' && (
        <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-metro-text">Comunicaciones de recogida</h3>
              <p className="mt-1 text-[11px] text-metro-muted">Revisa destinatarios, instrucciones y prepara los correos de los circuitos seleccionados.</p>
            </div>
            <ActionButton variant="primary" icon={MailPlus} iconOnly={false} loading={generatingMail} onClick={onOpenCollectionMails}>Abrir comunicaciones</ActionButton>
          </div>
        </section>
      )}

      {activeTab === 'recogida' && (
        collectionContent ?? (
          <section className="rounded-xl border border-metro-border bg-metro-panel/45 p-3">
            <p className="text-xs text-metro-muted">Preparando la recogida…</p>
          </section>
        )
      )}

      {activeTab === 'resultados' && (
        resultsReady && resultsContent ? resultsContent : (
          <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-metro-text">Resultados pendientes de validación</h3>
                <p className="mt-1 text-[11px] text-metro-muted">Recibe y revisa todos los circuitos y corrige los errores bloqueantes para habilitar el informe ejecutivo.</p>
              </div>
              <ActionButton variant="primary" icon={ClipboardCheck} iconOnly={false} onClick={onOpenResponseCollection}>Ir a recogida</ActionButton>
            </div>
          </section>
        )
      )}
    </div>
  );
}
