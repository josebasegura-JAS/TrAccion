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
    description: 'Actas creadas que todavía no han pasado a borrador.',
    tone: 'warning',
  },
  {
    state: 'Borrador',
    title: 'Borradores',
    description: 'Actas en elaboración y listas para seguir trabajando.',
    tone: 'info',
  },
  {
    state: 'Pendiente de alegaciones',
    title: 'Pendientes de alegaciones',
    description: 'Actas enviadas para recibir y registrar aportaciones.',
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
}: {
  section: StateSection;
  rows: Acta[];
  onOpenActa: (acta: Acta) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel/70">
      <div className="flex items-center justify-between gap-3 border-b border-metro-border bg-metro-surface/75 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black text-metro-text">{section.title}</h2>
            <StatusBadge size="xs" tone={section.tone}>{rows.length}</StatusBadge>
          </div>
          <p className="mt-0.5 text-[11px] text-metro-muted">{section.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_150px_28px] border-b border-metro-border/70 bg-metro-panel/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-metro-muted">
        <span>Título</span>
        <span>Fecha límite</span>
        <span className="sr-only">Abrir</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-3 py-4 text-xs text-metro-muted">No hay actas en este estado.</div>
      ) : (
        <div>
          {rows.map((acta) => (
            <button
              className="grid w-full grid-cols-[minmax(0,1fr)_150px_28px] items-center gap-2 border-b border-metro-border/60 px-3 py-2 text-left transition last:border-b-0 hover:bg-metro-raised/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-metro-red/50"
              key={acta.id}
              onClick={() => onOpenActa(acta)}
              type="button"
            >
              <p className="truncate text-xs font-bold text-metro-text" title={acta.titulo}>{acta.titulo}</p>
              <span className="text-xs font-semibold text-metro-secondary">{formatDate(acta.fechaLimite)}</span>
              <span aria-hidden="true" className="text-lg font-bold text-metro-muted">›</span>
            </button>
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

      <div className="grid gap-3 xl:grid-cols-2">
        {STATE_SECTIONS.map((section) => (
          <StateTable
            key={section.state}
            onOpenActa={onOpenActa}
            rows={sortByDeadline(openActas.filter((acta) => acta.estado === section.state))}
            section={section}
          />
        ))}
      </div>
    </section>
  );
}
