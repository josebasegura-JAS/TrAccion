import {
  Archive,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Clock3,
  FilePlus2,
  FileText,
  History,
  ListChecks,
  MessageCircle,
  PenLine,
  RefreshCw,
  Send,
  Signature,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Acta, ActaState } from '../domain/acta';

type WorkflowProps = {
  actas: Acta[];
  selectedActaId: string;
  onSelectedActaIdChange: (id: string) => void;
  onNewActa: () => void;
  onOpenActa: (acta: Acta) => void;
  onOpenOperational: (state?: ActaState) => void;
};

type Tone = 'blue' | 'amber' | 'green' | 'purple' | 'red' | 'neutral';

const toneClasses: Record<Tone, string> = {
  blue: 'border-blue-400/20 bg-blue-500/10 text-blue-200',
  amber: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  green: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  purple: 'border-purple-400/25 bg-purple-500/10 text-purple-200',
  red: 'border-red-400/25 bg-red-500/10 text-red-200',
  neutral: 'border-metro-border bg-metro-surface/80 text-metro-secondary',
};

const STATE_ORDER: ActaState[] = [
  'Pendiente de realizar',
  'Borrador',
  'Enviada a Dirección',
  'Pendiente de alegaciones',
  'Pendiente de firma',
  'Cerrada',
];

function getStateIndex(state: ActaState | undefined): number {
  return state ? STATE_ORDER.indexOf(state) : -1;
}

function WorkflowNumber({ value }: { value: number }) {
  return (
    <div className="absolute -left-[22px] top-4 z-10 grid h-10 w-10 place-items-center rounded-full border-4 border-metro-navy bg-metro-red text-lg font-black text-white shadow-lg">
      {value}
    </div>
  );
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: Tone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

function ActionCard({
  icon: Icon,
  label,
  onClick,
  accent = 'red',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  accent?: 'red' | 'blue' | 'green' | 'purple' | 'amber';
}) {
  const iconClass = {
    red: 'text-red-400 bg-red-500/10',
    blue: 'text-blue-400 bg-blue-500/10',
    green: 'text-emerald-400 bg-emerald-500/10',
    purple: 'text-purple-400 bg-purple-500/10',
    amber: 'text-amber-400 bg-amber-500/10',
  }[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[58px] items-center gap-3 rounded-xl border border-metro-border bg-metro-surface/75 px-4 py-3 text-left transition hover:border-metro-red/60 hover:bg-metro-raised"
    >
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${iconClass}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1 text-sm font-bold text-metro-text">{label}</span>
      <ChevronRight className="text-metro-muted transition group-hover:translate-x-0.5 group-hover:text-metro-text" size={18} />
    </button>
  );
}

function MiniKpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone: Tone; icon: LucideIcon }) {
  return (
    <div className={`flex min-h-[58px] items-center gap-3 rounded-xl border px-3 py-2.5 ${toneClasses[tone]}`}>
      <Icon size={22} />
      <div>
        <div className="text-xl font-black leading-none text-metro-text">{value}</div>
        <div className="mt-1 text-[11px] font-semibold opacity-80">{label}</div>
      </div>
    </div>
  );
}

function FlowStatus({
  label,
  completed,
  current,
}: {
  label: string;
  completed: boolean;
  current: boolean;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          completed
            ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300'
            : current
              ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
              : 'border-slate-500/60 bg-transparent text-slate-500'
        }`}
      >
        {completed ? <Check size={13} strokeWidth={3} /> : current ? <Clock3 size={11} /> : null}
      </span>
      <span className={`text-sm font-semibold ${completed ? 'text-metro-secondary' : current ? 'text-amber-100' : 'text-metro-muted'}`}>
        {label}
      </span>
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
}: WorkflowProps) {
  const openActas = actas.filter((acta) => acta.estado !== 'Cerrada');
  const selectedActa = openActas.find((acta) => acta.id === selectedActaId) ?? openActas[0] ?? null;
  const selectedStateIndex = getStateIndex(selectedActa?.estado);

  const pendingCount = actas.filter((acta) => acta.estado === 'Pendiente de realizar').length;
  const draftCount = actas.filter((acta) => acta.estado === 'Borrador').length;
  const directionCount = actas.filter((acta) => acta.estado === 'Enviada a Dirección').length;
  const allegationsActas = actas.filter((acta) => acta.estado === 'Pendiente de alegaciones');
  const allegationCount = allegationsActas.reduce(
    (sum, acta) => sum + acta.alegaciones.filter((item) => item.presentada).length,
    0,
  );
  const signatureCount = actas.filter((acta) => acta.estado === 'Pendiente de firma').length;
  const currentYear = new Date().getFullYear().toString();
  const signedThisYear = actas.filter(
    (acta) => acta.estado === 'Cerrada' && (acta.closedAt?.startsWith(currentYear) || acta.fechaSesion.startsWith(currentYear)),
  ).length;
  const updatesCount = selectedActa?.actualizaciones.length ?? 0;
  const selectedAllegations = selectedActa?.alegaciones.filter((item) => item.presentada).length ?? 0;

  const openSelected = () => {
    if (selectedActa) {
      onOpenActa(selectedActa);
    } else {
      onOpenOperational();
    }
  };

  return (
    <section className="space-y-3 pb-1" aria-label="Flujo de seguimiento de Actas">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-metro-border bg-metro-topbar px-4 py-3 shadow-card">
        <div>
          <h1 className="text-2xl font-black text-metro-text">Actas</h1>
          <p className="mt-0.5 text-sm text-metro-muted">Seguimiento del ciclo del acta</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-secondary">
            <CalendarDays size={17} className="text-blue-300" />
            <span className="hidden sm:inline">Acta activa:</span>
            <select
              className="max-w-[290px] bg-transparent font-bold text-metro-text outline-none"
              value={selectedActa?.id ?? ''}
              onChange={(event) => onSelectedActaIdChange(event.target.value)}
            >
              {openActas.length === 0 && <option value="">Sin actas abiertas</option>}
              {openActas.map((acta) => (
                <option key={acta.id} value={acta.id} className="bg-metro-surface text-metro-text">
                  {acta.titulo}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={openSelected}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-metro-red px-4 text-sm font-black text-white transition hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!selectedActa}
          >
            <ClipboardList size={18} /> Abrir seguimiento
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="relative ml-5 space-y-2.5 before:absolute before:bottom-8 before:left-[-2px] before:top-8 before:w-px before:bg-slate-500/55">
          <div className="relative rounded-2xl border border-metro-border bg-metro-panel/75 px-5 py-3.5 pl-9">
            <WorkflowNumber value={1} />
            <div className="grid items-center gap-3 xl:grid-cols-[250px_minmax(0,1fr)_175px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-metro-text">Nuevo acta</h2>
                  <StatusPill tone="blue">Inicio</StatusPill>
                </div>
                <p className="mt-1 text-xs text-metro-muted">Alta inicial del acta y datos básicos de la sesión.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <ActionCard icon={FilePlus2} label="Nueva acta" onClick={onNewActa} />
                <ActionCard icon={CalendarDays} label="Ver actas" accent="blue" onClick={() => onOpenOperational()} />
                <ActionCard icon={Users} label="Asistentes / datos" onClick={openSelected} />
              </div>
              <div className="rounded-xl border border-metro-border bg-metro-surface/65 px-3 py-2.5 text-xs">
                <div className="flex items-center gap-2 font-bold text-blue-200"><CalendarDays size={16} /> Acta seleccionada</div>
                <div className="mt-1.5 truncate font-black text-metro-text">{selectedActa?.titulo ?? 'Sin selección'}</div>
                <div className="mt-1 text-metro-muted">{selectedActa?.fechaSesion || '—'}</div>
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-metro-border bg-metro-panel/75 px-5 py-3.5 pl-9">
            <WorkflowNumber value={2} />
            <div className="grid items-center gap-3 xl:grid-cols-[250px_330px_minmax(0,1fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-black text-metro-text">Pendiente de realizar</h2>
                  <StatusPill tone="blue">Preparación</StatusPill>
                </div>
                <p className="mt-1 text-xs text-metro-muted">Actas creadas pendientes de pasarse a borrador.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <MiniKpi icon={FileText} label="abiertas" value={openActas.length} tone="blue" />
                <MiniKpi icon={Clock3} label="pendientes" value={pendingCount} tone="amber" />
                <MiniKpi icon={Check} label="en borrador" value={draftCount} tone="green" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <ActionCard icon={ListChecks} label="Ver pendientes" accent="blue" onClick={() => onOpenOperational('Pendiente de realizar')} />
                <ActionCard icon={Send} label="Cambiar a borrador" onClick={() => onOpenOperational('Pendiente de realizar')} />
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-metro-red/80 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/15 px-5 py-4 pl-9 shadow-[0_0_0_1px_rgba(220,38,38,0.08)]">
            <WorkflowNumber value={3} />
            <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_185px]">
              <div>
                <h2 className="text-lg font-black text-metro-text">Borrador / Dirección</h2>
                <div className="mt-2"><StatusPill tone="amber"><Sparkles size={11} className="mr-1" /> Trabajo principal del momento</StatusPill></div>
                <p className="mt-3 text-sm leading-5 text-metro-secondary">
                  Registrar el borrador y enviarlo a Dirección. Aquí puede haber actualizaciones.
                </p>
              </div>

              <div className="space-y-2.5">
                <div className="grid items-start gap-2 md:grid-cols-[1fr_28px_1fr_28px_1fr]">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-metro-text"><FileText size={17} className="text-red-400" /> a) Registrar borrador</div>
                    <div className="mt-2"><StatusPill tone="blue">{draftCount} en borrador</StatusPill></div>
                  </div>
                  <ArrowRight className="mx-auto mt-1 text-metro-muted" size={18} />
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-metro-text"><Send size={17} className="text-red-400" /> b) Enviar a Dirección</div>
                    <div className="mt-2"><StatusPill tone="amber">{directionCount} enviadas</StatusPill></div>
                  </div>
                  <ArrowRight className="mx-auto mt-1 text-metro-muted" size={18} />
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-xs font-bold text-metro-text"><RefreshCw size={17} className="text-purple-400" /> c) Actualizar</div>
                    <div className="mt-2"><StatusPill tone="purple">{updatesCount} actualizaciones</StatusPill></div>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-metro-border bg-metro-surface/55">
                  <div className="grid grid-cols-[1.15fr_.8fr_1.35fr_auto] gap-2 border-b border-metro-border px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-metro-muted">
                    <span>Actividad</span><span>Estado</span><span>Detalle</span><span>Acción</span>
                  </div>
                  {[
                    ['Borrador del acta', selectedActa?.estado === 'Borrador' ? 'En borrador' : draftCount ? `${draftCount} en borrador` : 'Pendiente', 'Documento base / seguimiento', 'blue'],
                    ['Envío a Dirección', selectedActa?.estado === 'Enviada a Dirección' ? 'Enviada' : directionCount ? `${directionCount} enviadas` : 'Pendiente', 'Remisión a Dirección', 'amber'],
                    ['Actualizaciones', `${updatesCount} registradas`, 'Cambios de seguimiento', 'purple'],
                  ].map(([activity, status, detail, tone]) => (
                    <button
                      type="button"
                      key={activity}
                      onClick={openSelected}
                      className="grid w-full grid-cols-[1.15fr_.8fr_1.35fr_auto] items-center gap-2 border-b border-metro-border/60 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-white/[0.025]"
                    >
                      <span className="font-semibold text-metro-secondary">{activity}</span>
                      <span><StatusPill tone={tone as Tone}>{status}</StatusPill></span>
                      <span className="text-metro-muted">{detail}</span>
                      <span className="font-bold text-blue-300">Ver detalle</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border border-metro-border bg-metro-surface/65 p-3 text-center">
                <div className="relative grid h-20 w-20 place-items-center rounded-full bg-blue-500/10 text-blue-200">
                  <ClipboardList size={42} />
                  <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-metro-red text-white"><Check size={18} strokeWidth={3} /></span>
                </div>
                <p className="mt-3 text-xs leading-4 text-metro-secondary">Gestiona el seguimiento del borrador, el envío a Dirección y las actualizaciones.</p>
                <button type="button" onClick={openSelected} className="mt-3 w-full rounded-lg bg-metro-red px-3 py-2 text-xs font-black text-white hover:bg-metro-dark">
                  Abrir panel del acta
                </button>
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-metro-border bg-metro-panel/75 px-5 py-3 pl-9">
            <WorkflowNumber value={4} />
            <div className="grid items-center gap-3 xl:grid-cols-[250px_minmax(0,1fr)_190px]">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-metro-text">Alegaciones</h2><StatusPill tone="blue">Revisión</StatusPill></div>
                <p className="mt-1 text-xs text-metro-muted">Gestiona alegaciones y posibles actualizaciones posteriores.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <ActionCard icon={MessageCircle} label="Alegaciones" accent="purple" onClick={() => onOpenOperational('Pendiente de alegaciones')} />
                <ActionCard icon={RefreshCw} label="Actualizar acta" accent="blue" onClick={openSelected} />
                <ActionCard icon={History} label="Historial de cambios" onClick={openSelected} />
              </div>
              <div className="flex flex-wrap gap-2 xl:flex-col">
                <StatusPill tone="purple">{selectedAllegations} alegaciones</StatusPill>
                <StatusPill tone="purple">{updatesCount} actualizaciones</StatusPill>
              </div>
            </div>
          </div>

          <div className="relative rounded-2xl border border-metro-border bg-metro-panel/75 px-5 py-3 pl-9">
            <WorkflowNumber value={5} />
            <div className="grid items-center gap-3 xl:grid-cols-[250px_minmax(0,1fr)_190px]">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black text-metro-text">Firma definitiva</h2><StatusPill tone="blue">Cierre</StatusPill></div>
                <p className="mt-1 text-xs text-metro-muted">Enviar el acta definitiva para firma.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <ActionCard icon={PenLine} label="Pendientes de firma" accent="amber" onClick={() => onOpenOperational('Pendiente de firma')} />
                <ActionCard icon={Send} label="Enviar a firmar" accent="green" onClick={() => onOpenOperational('Pendiente de firma')} />
                <ActionCard icon={Archive} label="Histórico" onClick={() => onOpenOperational('Cerrada')} />
              </div>
              <div><StatusPill tone="green">{signatureCount} pendientes de firma</StatusPill></div>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-metro-border bg-metro-panel/80 p-4">
            <div className="flex items-center gap-2 text-base font-black text-metro-text"><ListChecks size={20} className="text-blue-300" /> Estado del flujo</div>
            <div className="mt-3">
              <FlowStatus label="Acta creada" completed={Boolean(selectedActa)} current={false} />
              <FlowStatus label="Pendiente de realizar" completed={selectedStateIndex >= 0} current={selectedStateIndex === 0} />
              <FlowStatus label="Borrador registrado" completed={selectedStateIndex >= 1} current={selectedStateIndex === 1} />
              <FlowStatus label="Envío a Dirección" completed={selectedStateIndex >= 2} current={selectedStateIndex === 2} />
              <FlowStatus label="Alegaciones registradas" completed={selectedStateIndex >= 3} current={selectedStateIndex === 3} />
              <FlowStatus label="Firma definitiva" completed={selectedStateIndex >= 5} current={selectedStateIndex === 4} />
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${toneClasses.blue}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><FileText size={22} /> Actas abiertas</div>
            <div className="mt-2 text-3xl font-black text-metro-text">{openActas.length}</div>
          </div>
          <div className={`rounded-2xl border p-4 ${toneClasses.amber}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><Clock3 size={22} /> Pendientes de borrador</div>
            <div className="mt-2 text-3xl font-black text-metro-text">{pendingCount}</div>
          </div>
          <div className={`rounded-2xl border p-4 ${toneClasses.purple}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><MessageCircle size={22} /> Alegaciones</div>
            <div className="mt-2 text-3xl font-black text-metro-text">{allegationCount}</div>
          </div>
          <div className={`rounded-2xl border p-4 ${toneClasses.green}`}>
            <div className="flex items-center gap-2 text-sm font-bold"><Signature size={22} /> Firmadas este año</div>
            <div className="mt-2 text-3xl font-black text-metro-text">{signedThisYear}</div>
          </div>
        </aside>
      </div>

      <div className="grid gap-2 rounded-2xl border border-metro-border bg-metro-panel/75 p-3 md:grid-cols-[180px_repeat(5,minmax(0,1fr))]">
        <div className="flex items-center gap-2 px-2 text-sm font-black text-metro-text"><Sparkles size={19} className="text-red-400" /> Accesos rápidos</div>
        <ActionCard icon={CalendarDays} label="Actas" onClick={() => onOpenOperational()} />
        <ActionCard icon={FileText} label="Pendientes" accent="blue" onClick={() => onOpenOperational('Pendiente de realizar')} />
        <ActionCard icon={ClipboardList} label="Borrador" onClick={() => onOpenOperational('Borrador')} />
        <ActionCard icon={MessageCircle} label="Alegaciones" accent="purple" onClick={() => onOpenOperational('Pendiente de alegaciones')} />
        <ActionCard icon={Signature} label="Firmas" accent="green" onClick={() => onOpenOperational('Pendiente de firma')} />
      </div>
    </section>
  );
}
