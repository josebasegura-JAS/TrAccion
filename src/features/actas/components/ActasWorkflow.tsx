import {
  Archive,
  CalendarDays,
  ClipboardList,
  FilePlus2,
  FileText,
  History,
  Mail,
  MessageCircle,
  PenLine,
  Settings2,
  Signature,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ModuleHelpButton } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { ACTAS_HELP_SECTIONS, formatDate, renderActaStateBadge } from './actasPage.helpers';
import type { Acta, ActaState } from '../domain/acta';

type WorkflowProps = {
  actas: Acta[];
  selectedActaId: string;
  onSelectedActaIdChange: (id: string) => void;
  onNewActa: () => void;
  onOpenActa: (acta: Acta) => void;
  onOpenOperational: (state?: ActaState) => void;
  onOpenTypeManager: () => void;
  onOpenOutlookTemplate: () => void;
};

type Tone = 'info' | 'warning' | 'accent' | 'success' | 'muted';

type StageConfig = {
  title: string;
  state: ActaState;
  description: string;
  actionLabel: string;
  icon: LucideIcon;
  tone: Tone;
};

const STAGE_CONFIGS: StageConfig[] = [
  {
    title: 'Pendientes de realizar',
    state: 'Pendiente de realizar',
    description: 'Actas creadas pero todavía sin documento de trabajo o sin empezar el seguimiento.',
    actionLabel: 'Ver pendientes',
    icon: FileText,
    tone: 'warning',
  },
  {
    title: 'Borradores',
    state: 'Borrador',
    description: 'Actas en elaboración o revisión interna antes del envío a Dirección.',
    actionLabel: 'Ver borradores',
    icon: ClipboardList,
    tone: 'info',
  },
  {
    title: 'Alegaciones',
    state: 'Pendiente de alegaciones',
    description: 'Actas que requieren seguimiento de alegaciones y posibles actualizaciones posteriores.',
    actionLabel: 'Ver alegaciones',
    icon: MessageCircle,
    tone: 'accent',
  },
  {
    title: 'Firma definitiva',
    state: 'Pendiente de firma',
    description: 'Actas listas para la firma o pendientes de adjuntar la versión final cerrada.',
    actionLabel: 'Ver firmas',
    icon: Signature,
    tone: 'success',
  },
];

const FLOW_STEPS: Array<{ title: string; state?: ActaState }> = [
  { title: 'Crear acta', state: 'Pendiente de realizar' },
  { title: 'Preparar borrador', state: 'Borrador' },
  { title: 'Enviar a Dirección', state: 'Enviada a Dirección' },
  { title: 'Registrar alegaciones', state: 'Pendiente de alegaciones' },
  { title: 'Firmar y cerrar', state: 'Pendiente de firma' },
  { title: 'Archivar', state: 'Cerrada' },
];

function getStatusTone(state: ActaState): Tone {
  if (state === 'Pendiente de realizar') return 'warning';
  if (state === 'Borrador' || state === 'Enviada a Dirección') return 'info';
  if (state === 'Pendiente de alegaciones') return 'accent';
  if (state === 'Pendiente de firma') return 'success';
  return 'muted';
}

function formatShortNumber(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  const toneClassName = {
    accent: 'border-violet-400/25 bg-violet-500/10 text-violet-100',
    info: 'border-blue-400/25 bg-blue-500/10 text-blue-100',
    muted: 'border-metro-border bg-metro-surface/75 text-metro-secondary',
    success: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-400/25 bg-amber-400/10 text-amber-100',
  }[tone];

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${toneClassName}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]">
        <Icon size={15} />
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-black leading-none text-metro-text">{formatShortNumber(value)}</div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  icon: Icon,
  action,
  footer,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-metro-border bg-metro-surface/75 p-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-metro-red/10 text-metro-red">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black text-metro-text">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-metro-muted">{description}</p>
        </div>
      </div>
      <div className="mt-3">{action}</div>
      {footer ? <div className="mt-2 text-[11px] text-metro-muted">{footer}</div> : null}
    </div>
  );
}

function StageCard({
  config,
  count,
  onOpen,
}: {
  config: StageConfig;
  count: number;
  onOpen: () => void;
}) {
  const Icon = config.icon;
  const toneClassName = {
    accent: 'border-violet-400/25 bg-violet-500/[0.08]',
    info: 'border-blue-400/25 bg-blue-500/[0.08]',
    muted: 'border-metro-border bg-metro-surface/75',
    success: 'border-emerald-400/25 bg-emerald-500/[0.08]',
    warning: 'border-amber-400/25 bg-amber-400/[0.08]',
  }[config.tone];

  return (
    <div className={`rounded-2xl border p-3 ${toneClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-metro-panel/65 text-metro-text">
            <Icon size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-metro-text">{config.title}</h3>
            <p className="mt-1 text-xs leading-5 text-metro-muted">{config.description}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-black leading-none text-metro-text">{formatShortNumber(count)}</div>
          <div className="mt-1">
            <StatusBadge size="xs" tone={config.tone}>Bandeja</StatusBadge>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <ActionButton iconOnly={false} onClick={onOpen} size="sm" variant="secondary">
          {config.actionLabel}
        </ActionButton>
      </div>
    </div>
  );
}

function FlowStep({
  index,
  title,
  active,
  completed,
}: {
  index: number;
  title: string;
  active: boolean;
  completed: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
        active
          ? 'border-metro-red/45 bg-metro-red/10'
          : completed
            ? 'border-emerald-400/25 bg-emerald-500/[0.07]'
            : 'border-metro-border bg-metro-surface/75'
      }`}
    >
      <div
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${
          active
            ? 'bg-metro-red text-white'
            : completed
              ? 'bg-emerald-600 text-white'
              : 'bg-metro-panel text-metro-muted'
        }`}
      >
        {index + 1}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-metro-muted">Paso {index + 1}</p>
        <p className="text-xs font-bold leading-5 text-metro-text">{title}</p>
      </div>
    </div>
  );
}

export function ActasWorkflow({
  actas,
  selectedActaId,
  onSelectedActaIdChange,
  onNewActa,
  onOpenActa,
  onOpenOperational,
  onOpenTypeManager,
  onOpenOutlookTemplate,
}: WorkflowProps) {
  const openActas = actas.filter((acta) => acta.estado !== 'Cerrada');
  const selectedActa = openActas.find((acta) => acta.id === selectedActaId) ?? openActas[0] ?? null;
  const selectedStateIndex = selectedActa
    ? FLOW_STEPS.findIndex((step) => step.state === selectedActa.estado)
    : -1;

  const currentYear = new Date().getFullYear().toString();
  const pendingCount = actas.filter((acta) => acta.estado === 'Pendiente de realizar').length;
  const draftCount = actas.filter((acta) => acta.estado === 'Borrador').length;
  const allegationCount = actas.filter((acta) => acta.estado === 'Pendiente de alegaciones').length;
  const signatureCount = actas.filter((acta) => acta.estado === 'Pendiente de firma').length;
  const closedThisYear = actas.filter(
    (acta) =>
      acta.estado === 'Cerrada' &&
      ((acta.closedAt && acta.closedAt.startsWith(currentYear)) || acta.fechaSesion.startsWith(currentYear)),
  ).length;
  const selectedAllegations = selectedActa?.alegaciones.filter((item) => item.presentada).length ?? 0;
  const selectedUpdates = selectedActa?.actualizaciones.length ?? 0;

  return (
    <section aria-label="Centro de trabajo de Actas" className="space-y-3 pb-1">
      <div className="rounded-2xl border border-metro-border bg-metro-topbar px-4 py-3 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black text-metro-text">Actas</h1>
              <StatusBadge size="xs" tone="info">Centro de trabajo</StatusBadge>
            </div>
            <p className="mt-1 text-xs leading-5 text-metro-muted">
              Pantalla simplificada para crear actas, continuar las abiertas y entrar rápido en cada bandeja de trabajo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton iconOnly={false} onClick={onNewActa} size="sm" variant="add">
              Nueva acta
            </ActionButton>
            <ActionButton
              disabled={!selectedActa}
              iconOnly={false}
              onClick={() => selectedActa && onOpenActa(selectedActa)}
              size="sm"
              variant="secondary"
            >
              Continuar acta activa
            </ActionButton>
            <ActionButton iconOnly={false} onClick={() => onOpenOperational()} size="sm" variant="secondary">
              Ver seguimiento
            </ActionButton>
            <ModuleHelpButton
              ariaLabel="Abrir ayuda del módulo Actas"
              sections={ACTAS_HELP_SECTIONS}
              subtitle="Guía rápida del ciclo de actas, estados, alegaciones e histórico."
              title="Actas"
            />
          </div>
        </div>

        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-metro-muted">Acta activa</p>
                <p className="mt-0.5 text-xs text-metro-muted">Selecciona una acta abierta para continuar exactamente donde la dejaste.</p>
              </div>
              <div className="w-full sm:w-auto">
                <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-[12px] font-semibold text-metro-secondary">
                  <CalendarDays size={15} className="text-blue-300" />
                  <select
                    className="min-w-[220px] bg-transparent font-bold text-metro-text outline-none"
                    onChange={(event) => onSelectedActaIdChange(event.target.value)}
                    value={selectedActa?.id ?? ''}
                  >
                    {openActas.length === 0 && <option value="">Sin actas abiertas</option>}
                    {openActas.map((acta) => (
                      <option className="bg-metro-surface text-metro-text" key={acta.id} value={acta.id}>
                        {acta.titulo}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {selectedActa ? (
              <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="rounded-xl border border-metro-border bg-metro-surface/80 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-metro-text">{selectedActa.titulo}</p>
                    <StatusBadge size="xs" tone={getStatusTone(selectedActa.estado)}>{selectedActa.tipo}</StatusBadge>
                    {renderActaStateBadge(selectedActa.estado)}
                  </div>
                  <div className="mt-2 grid gap-2 text-xs text-metro-secondary sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="font-semibold text-metro-muted">Fecha sesión</p>
                      <p className="mt-0.5 font-bold text-metro-text">{formatDate(selectedActa.fechaSesion)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-metro-muted">Fecha límite</p>
                      <p className="mt-0.5 font-bold text-metro-text">{formatDate(selectedActa.fechaLimite)}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-metro-muted">Actualizaciones</p>
                      <p className="mt-0.5 font-bold text-metro-text">{selectedUpdates}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-metro-muted">Alegaciones</p>
                      <p className="mt-0.5 font-bold text-metro-text">{selectedAllegations}</p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-metro-border bg-metro-surface/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-metro-muted">Acciones rápidas</p>
                  <div className="mt-2 grid gap-2">
                    <ActionButton
                      iconOnly={false}
                      onClick={() => onOpenActa(selectedActa)}
                      size="sm"
                      variant="secondary"
                    >
                      Abrir acta
                    </ActionButton>
                    <ActionButton
                      iconOnly={false}
                      onClick={() => onOpenOperational(selectedActa.estado)}
                      size="sm"
                      variant="secondary"
                    >
                      Abrir su bandeja
                    </ActionButton>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-metro-border bg-metro-surface/60 px-3 py-5 text-sm text-metro-muted">
                No hay actas abiertas. Puedes crear una nueva o consultar el histórico desde la vista operativa.
              </div>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            <KpiCard icon={ClipboardList} label="Actas abiertas" tone="info" value={openActas.length} />
            <KpiCard icon={FileText} label="Pendientes" tone="warning" value={pendingCount} />
            <KpiCard icon={MessageCircle} label="Alegaciones" tone="accent" value={allegationCount} />
            <KpiCard icon={Signature} label="Firmadas este año" tone="success" value={closedThisYear} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-metro-text">Qué quieres hacer</h2>
                <p className="mt-1 text-xs text-metro-muted">Los accesos principales del módulo están agrupados aquí para evitar pasos innecesarios.</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <QuickActionCard
                action={
                  <ActionButton iconOnly={false} onClick={onNewActa} size="sm" variant="add">
                    Crear acta
                  </ActionButton>
                }
                description="Alta manual de una nueva acta con sus datos básicos de sesión y seguimiento."
                footer="También puedes generar actas desde el cierre de sesión en Comité o Paritaria."
                icon={FilePlus2}
                title="Nueva acta"
              />
              <QuickActionCard
                action={
                  <ActionButton
                    disabled={!selectedActa}
                    iconOnly={false}
                    onClick={() => selectedActa && onOpenActa(selectedActa)}
                    size="sm"
                    variant="secondary"
                  >
                    Abrir acta activa
                  </ActionButton>
                }
                description="Retoma la acta abierta que tengas seleccionada para editarla o avanzar su estado."
                footer={selectedActa ? `Acta actual: ${selectedActa.titulo}` : 'No hay ninguna acta abierta seleccionada.'}
                icon={ClipboardList}
                title="Continuar trabajo"
              />
              <QuickActionCard
                action={
                  <ActionButton iconOnly={false} onClick={() => onOpenOperational()} size="sm" variant="secondary">
                    Abrir vista operativa
                  </ActionButton>
                }
                description="Entra en la tabla completa de abiertas e histórico, con búsqueda, filtros y exportación."
                icon={Archive}
                title="Consulta operativa"
              />
              <QuickActionCard
                action={
                  <div className="flex flex-wrap gap-2">
                    <ActionButton iconOnly={false} onClick={onOpenTypeManager} size="sm" variant="secondary">
                      Tipos de acta
                    </ActionButton>
                    <ActionButton iconOnly={false} onClick={onOpenOutlookTemplate} size="sm" variant="secondary">
                      Plantilla Outlook
                    </ActionButton>
                  </div>
                }
                description="Configura el catálogo de tipos de acta y la plantilla de correo para la fase de alegaciones."
                icon={Settings2}
                title="Configuración rápida"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <div>
              <h2 className="text-sm font-black text-metro-text">Bandejas de trabajo</h2>
              <p className="mt-1 text-xs text-metro-muted">Entra directamente en el punto del proceso que quieres revisar.</p>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {STAGE_CONFIGS.map((config) => (
                <StageCard
                  config={config}
                  count={actas.filter((acta) => acta.estado === config.state).length}
                  key={config.state}
                  onOpen={() => onOpenOperational(config.state)}
                />
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <h2 className="text-sm font-black text-metro-text">Pasos del módulo</h2>
            <p className="mt-1 text-xs text-metro-muted">Resumen visual del ciclo. Si tienes una acta activa, se resalta su situación actual.</p>
            <div className="mt-3 space-y-2">
              {FLOW_STEPS.map((step, index) => (
                <FlowStep
                  active={selectedActa ? selectedActa.estado === step.state : index === 0}
                  completed={selectedStateIndex > index}
                  index={index}
                  key={`${step.title}-${index}`}
                  title={step.title}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <h2 className="text-sm font-black text-metro-text">Recordatorios útiles</h2>
            <div className="mt-3 space-y-2 text-xs leading-5 text-metro-muted">
              <p className="rounded-xl border border-metro-border bg-metro-surface/75 px-3 py-2.5">
                <span className="font-bold text-metro-text">Tipos de acta:</span> si necesitas uno nuevo, entra en <span className="font-bold text-metro-text">Configuración rápida → Tipos de acta</span>.
              </p>
              <p className="rounded-xl border border-metro-border bg-metro-surface/75 px-3 py-2.5">
                <span className="font-bold text-metro-text">Correo de alegaciones:</span> la plantilla de Outlook se ajusta desde <span className="font-bold text-metro-text">Configuración rápida → Plantilla Outlook</span>.
              </p>
              <p className="rounded-xl border border-metro-border bg-metro-surface/75 px-3 py-2.5">
                <span className="font-bold text-metro-text">Histórico:</span> para ver actas cerradas, usa <span className="font-bold text-metro-text">Consulta operativa</span> y abre el ejercicio que necesites.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-metro-border bg-metro-panel/70 p-3">
            <h2 className="text-sm font-black text-metro-text">Indicadores rápidos</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <KpiCard icon={FileText} label="Borradores" tone="info" value={draftCount} />
              <KpiCard icon={PenLine} label="Pendientes de firma" tone="success" value={signatureCount} />
              <KpiCard icon={History} label="Histórico cerrado" tone="muted" value={actas.filter((acta) => acta.estado === 'Cerrada').length} />
              <KpiCard icon={Mail} label="Enviadas a Dirección" tone="info" value={actas.filter((acta) => acta.estado === 'Enviada a Dirección').length} />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
