import { Archive, FilePlus2, Settings2 } from 'lucide-react';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import type { Acta, ActaState } from '../domain/acta';
import { formatDate } from './actasPage.helpers';

type WorkflowProps = {
  actas: Acta[];
  onNewActa: () => void;
  onOpenActa: (acta: Acta) => void;
  onOpenOperational: (state?: ActaState) => void;
  onOpenTypeManager: () => void;
  onDeleteActa: (actaId: string) => void;
};

type StateSection = {
  state: Exclude<ActaState, 'Cerrada'>;
  title: string;
  description: string;
  tone: 'warning' | 'info' | 'accent' | 'success';
};

const STATE_SECTIONS: StateSection[] = [
  {
    state: 'Pendiente de realizar',
    title: 'Pendientes de realizar',
    description: 'Actas dadas de alta que todavía están pendientes de preparar y enviar como borrador.',
    tone: 'warning',
  },
  {
    state: 'Pendiente de alegaciones',
    title: 'Pendientes de alegaciones',
    description: 'Borradores enviados a sindicatos y Dirección con el plazo de alegaciones abierto.',
    tone: 'accent',
  },
  {
    state: 'Pendiente de firma',
    title: 'Pendientes de firma',
    description: 'Actas definitivas pendientes de firma y cierre.',
    tone: 'success',
  },
];


function sortByDeadline(rows: Acta[]): Acta[] {
  return [...rows].sort((first, second) => {
    if (first.fechaLimite && second.fechaLimite && first.fechaLimite !== second.fechaLimite) {
      return first.fechaLimite.localeCompare(second.fechaLimite);
    }
    if (first.fechaLimite) return -1;
    if (second.fechaLimite) return 1;
    return second.fechaSesion.localeCompare(first.fechaSesion);
  });
}

function StateTable({
  section,
  rows,
  onOpenActa,
  onDeleteActa,
}: {
  section: StateSection;
  rows: Acta[];
  onOpenActa: (acta: Acta) => void;
  onDeleteActa: (actaId: string) => void;
}) {
  const toneClasses = {
    warning: {
      panel: 'border-amber-400/25 bg-amber-400/[0.055]',
      header: 'border-amber-400/20 bg-amber-400/[0.075]',
      columns: 'border-amber-400/15 bg-amber-400/[0.035]',
      rowHover: 'hover:bg-amber-400/[0.07]',
    },
    info: {
      panel: 'border-blue-400/25 bg-blue-500/[0.05]',
      header: 'border-blue-400/20 bg-blue-500/[0.075]',
      columns: 'border-blue-400/15 bg-blue-500/[0.035]',
      rowHover: 'hover:bg-blue-500/[0.07]',
    },
    accent: {
      panel: 'border-violet-400/25 bg-violet-500/[0.05]',
      header: 'border-violet-400/20 bg-violet-500/[0.075]',
      columns: 'border-violet-400/15 bg-violet-500/[0.035]',
      rowHover: 'hover:bg-violet-500/[0.07]',
    },
    success: {
      panel: 'border-emerald-400/25 bg-emerald-500/[0.05]',
      header: 'border-emerald-400/20 bg-emerald-500/[0.075]',
      columns: 'border-emerald-400/15 bg-emerald-500/[0.035]',
      rowHover: 'hover:bg-emerald-500/[0.07]',
    },
  }[section.tone];

  return (
    <section className={`overflow-hidden rounded-xl border ${toneClasses.panel}`}>
      <div className={`flex items-center justify-between gap-3 border-b px-3 py-2.5 ${toneClasses.header}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-metro-text">{section.title}</h2>
            <StatusBadge size="xs" tone={section.tone}>{rows.length}</StatusBadge>
          </div>
          <p className="mt-0.5 text-[11px] text-metro-muted">{section.description}</p>
        </div>
      </div>

      <div className={`grid grid-cols-[minmax(0,1fr)_150px_64px] border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-metro-muted ${toneClasses.columns}`}>
        <span>Título</span>
        <span>Fecha límite</span>
        <span className="sr-only">Acciones</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-metro-muted">No hay actas en este estado.</div>
      ) : (
        <div>
          {rows.map((acta) => (
            <div
              className={`grid grid-cols-[minmax(0,1fr)_150px_64px] items-center gap-2 border-b border-metro-border/50 px-3 py-2 transition last:border-b-0 ${toneClasses.rowHover}`}
              key={acta.id}
            >
              <button
                className="min-w-0 text-left focus:outline-none focus:ring-2 focus:ring-metro-red/50"
                onClick={() => onOpenActa(acta)}
                type="button"
              >
                <p className="truncate text-xs font-bold text-metro-text" title={acta.titulo}>{acta.titulo}</p>
              </button>
              <button
                className="text-left text-xs font-semibold text-metro-secondary focus:outline-none focus:ring-2 focus:ring-metro-red/50"
                onClick={() => onOpenActa(acta)}
                type="button"
              >
                {formatDate(acta.fechaLimite)}
              </button>
              <div className="flex items-center justify-end gap-1">
                <button
                  aria-label={`Abrir ${acta.titulo}`}
                  className="grid h-7 w-7 place-items-center rounded-md text-lg font-bold text-metro-muted transition hover:bg-white/[0.05] hover:text-metro-text"
                  onClick={() => onOpenActa(acta)}
                  title="Abrir acta"
                  type="button"
                >
                  ›
                </button>
                <ActionButton
                  iconOnly
                  onClick={() => onDeleteActa(acta.id)}
                  size="sm"
                  title={`Eliminar ${acta.titulo}`}
                  variant="delete"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActasWorkflow({
  actas,
  onNewActa,
  onOpenActa,
  onOpenOperational,
  onOpenTypeManager,
  onDeleteActa,
}: WorkflowProps) {
  const openActas = actas.filter((acta) => acta.estado !== 'Cerrada');

  return (
    <section aria-label="Inicio de Actas" className="space-y-3 pb-1">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-metro-border bg-metro-topbar px-3 py-2.5 shadow-card">
        <div className="min-w-0">
          <h1 className="text-lg font-black text-metro-text">Actas</h1>
          <p className="mt-0.5 text-xs text-metro-muted">
            {openActas.length} acta{openActas.length === 1 ? '' : 's'} en curso. Pulsa una fila para abrirla y seguir trabajando.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ActionButton icon={FilePlus2} iconOnly={false} onClick={onNewActa} size="sm" variant="add">
            Nueva acta
          </ActionButton>
          <ActionButton icon={Settings2} iconOnly={false} onClick={onOpenTypeManager} size="sm" variant="secondary">
            Tipos de acta
          </ActionButton>
          <ActionButton icon={Archive} iconOnly={false} onClick={() => onOpenOperational('Cerrada')} size="sm" variant="secondary">
            Histórico
          </ActionButton>
        </div>
      </div>

      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-metro-border bg-metro-panel/45 text-center text-[11px] font-bold text-metro-muted">
        <div className="border-r border-metro-border px-3 py-2"><span className="text-amber-200">1.</span> Preparar borrador</div>
        <div className="border-r border-metro-border px-3 py-2"><span className="text-violet-200">2.</span> Recibir alegaciones</div>
        <div className="px-3 py-2"><span className="text-emerald-200">3.</span> Firma y cierre</div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {STATE_SECTIONS.map((section) => (
          <StateTable
            key={section.state}
            onDeleteActa={onDeleteActa}
            onOpenActa={onOpenActa}
            rows={sortByDeadline(openActas.filter((acta) => acta.estado === section.state))}
            section={section}
          />
        ))}
      </div>
    </section>
  );
}
