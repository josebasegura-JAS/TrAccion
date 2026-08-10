import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  Download,
  FileCheck2,
  FilePlus2,
  History,
  ListChecks,
  Search,
  Send,
  ShieldCheck,
  TrafficCone,
  Upload,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function StepNumber({ number }: { number: number }) {
  return (
    <div className="absolute -left-[30px] top-3 z-10 grid h-8 w-8 place-items-center rounded-full border-[3px] border-metro-navy bg-metro-red text-xs font-extrabold text-white shadow-lg">
      {number}
    </div>
  );
}

function WorkflowAction({
  icon: Icon,
  label,
  onClick,
  emphasis = false,
}: {
  icon: typeof CalendarDays;
  label: string;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <button
      className={cx(
        'group flex min-h-[46px] items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition',
        emphasis
          ? 'border-metro-red bg-metro-red text-white shadow-[0_8px_20px_rgba(220,38,38,0.18)] hover:bg-metro-dark'
          : 'border-metro-border bg-metro-surface/85 text-metro-text hover:border-metro-red/60 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
          emphasis ? 'bg-white/10 text-white' : 'bg-metro-red/10 text-red-300',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-xs font-bold leading-4">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-55 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  tone = 'red',
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: 'red' | 'amber' | 'green' | 'blue';
}) {
  const toneClasses = {
    red: 'border-red-400/20 bg-red-500/[0.055] text-red-300',
    amber: 'border-amber-400/20 bg-amber-500/[0.055] text-amber-300',
    green: 'border-emerald-400/20 bg-emerald-500/[0.055] text-emerald-300',
    blue: 'border-blue-400/20 bg-blue-500/[0.055] text-blue-300',
  };

  return (
    <div className={cx('flex min-h-[46px] items-center gap-2 rounded-lg border px-3 py-2', toneClasses[tone])}>
      <Icon className="h-4 w-4 shrink-0" />
      <div>
        <div className="text-lg font-extrabold leading-5 text-metro-text">{value}</div>
        <div className="text-[9px] font-semibold leading-3 opacity-90">{label}</div>
      </div>
    </div>
  );
}

function StatusLine({
  label,
  state,
  detail,
}: {
  label: string;
  state: 'done' | 'pending' | 'neutral';
  detail?: string;
}) {
  const Icon = state === 'done' ? CheckCircle2 : state === 'pending' ? Clock3 : Circle;
  const iconClass = state === 'done' ? 'text-emerald-400' : state === 'pending' ? 'text-amber-400' : 'text-blue-300';
  return (
    <div className="flex items-start gap-2">
      <Icon className={cx('mt-px h-3.5 w-3.5 shrink-0', iconClass)} />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold leading-4 text-metro-secondary">{label}</p>
        {detail ? <p className="text-[10px] leading-4 text-metro-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: 'amber' | 'blue' | 'green' | 'red';
}) {
  const toneClasses = {
    amber: 'bg-amber-500/10 text-amber-300',
    blue: 'bg-blue-500/10 text-blue-300',
    green: 'bg-emerald-500/10 text-emerald-300',
    red: 'bg-red-500/10 text-red-300',
  };
  return <span className={cx('rounded-full px-2 py-0.5 text-[9px] font-bold', toneClasses[tone])}>{label}</span>;
}

export interface TeletrabajoWorkflowProps {
  periodo: string;
  periodos: readonly string[];
  total: number;
  nuevas: number;
  pendientes: number;
  analizadas: number;
  aprobadas: number;
  denegadas: number;
  desistidas: number;
  incidencias: number;
  bloqueantes: number;
  puestosCount: number;
  gruposCount: number;
  onPeriodoChange: (periodo: string) => void;
  onOpenPeriodos: () => void;
  onOpenPuestos: () => void;
  onOpenGrupos: () => void;
  onCreateSolicitud: () => void;
  onOpenSolicitudes: () => void;
  onOpenPendientes: () => void;
  onOpenAprobadas: () => void;
  onOpenDenegadas: () => void;
  onOpenIncidencias: () => void;
  onOpenValidacion: () => void;
  onExportDireccion: () => void;
  onOpenHistorico: () => void;
}

export function TeletrabajoWorkflow({
  periodo,
  periodos,
  total,
  nuevas,
  pendientes,
  analizadas,
  aprobadas,
  denegadas,
  desistidas,
  incidencias,
  bloqueantes,
  puestosCount,
  gruposCount,
  onPeriodoChange,
  onOpenPeriodos,
  onOpenPuestos,
  onOpenGrupos,
  onCreateSolicitud,
  onOpenSolicitudes,
  onOpenPendientes,
  onOpenAprobadas,
  onOpenDenegadas,
  onOpenIncidencias,
  onOpenValidacion,
  onExportDireccion,
  onOpenHistorico,
}: TeletrabajoWorkflowProps) {
  const resolvedCount = aprobadas + denegadas + desistidas;
  const hasPending = pendientes > 0 || analizadas > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-base font-extrabold text-metro-text">Teletrabajo</p>
          <p className="text-[11px] text-metro-muted">Gestión de periodos, solicitudes, validación y cobertura</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Periodo activo"
            className="h-8 min-w-[170px] rounded-lg border border-metro-border bg-metro-surface px-3 text-xs font-semibold text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onPeriodoChange(event.target.value)}
            value={periodo}
          >
            {periodos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-metro-red px-3 text-xs font-bold text-white hover:bg-metro-dark"
            onClick={onOpenValidacion}
            type="button"
          >
            <ListChecks className="h-4 w-4" /> Revisar solicitudes
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_238px]">
        <div className="relative ml-8 space-y-2.5 before:absolute before:-left-[17px] before:top-5 before:bottom-5 before:w-px before:bg-metro-bluegray/70">
          <section className="relative rounded-xl border border-metro-border bg-metro-panel px-4 py-3">
            <StepNumber number={1} />
            <div className="grid items-center gap-3 xl:grid-cols-[250px_minmax(0,1fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-extrabold text-metro-text">Periodo activo</h2>
                  <span className="rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-2 py-0.5 text-[9px] font-bold text-blue-300">Configuración base</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-metro-muted">Abre o copia periodos y define la base del teletrabajo.</p>
                <p className="mt-1 text-[10px] font-semibold text-blue-300">{periodo || 'Sin periodo'} · {total} solicitudes</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={CalendarDays} label="Gestionar periodos" onClick={onOpenPeriodos} />
                <WorkflowAction icon={FilePlus2} label="Copiar periodo anterior" onClick={onOpenPeriodos} />
                <WorkflowAction icon={BriefcaseBusiness} label={`Puestos teletrabajables · ${puestosCount}`} onClick={onOpenPuestos} />
              </div>
            </div>
          </section>

          <section className="relative rounded-xl border border-metro-border bg-metro-panel px-4 py-3">
            <StepNumber number={2} />
            <div className="grid items-center gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-extrabold text-metro-text">Solicitudes</h2>
                  <span className="rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-2 py-0.5 text-[9px] font-bold text-blue-300">Entrada y registro</span>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-metro-muted">Entrada, alta y consulta de solicitudes del periodo.</p>
              </div>
              <div className="grid gap-2 xl:grid-cols-[repeat(3,100px)_repeat(3,minmax(130px,1fr))]">
                <MiniStat icon={Users} label="totales" value={total} />
                <MiniStat icon={UserPlus} label="nuevas" value={nuevas} />
                <MiniStat icon={Clock3} label="pendientes" tone="amber" value={pendientes} />
                <WorkflowAction icon={UserPlus} label="Nueva solicitud" onClick={onCreateSolicitud} />
                <WorkflowAction icon={Upload} label="Importar / registrar" onClick={onOpenSolicitudes} />
                <WorkflowAction icon={ListChecks} label="Ver solicitudes" onClick={onOpenSolicitudes} />
              </div>
            </div>
          </section>

          <section className="relative rounded-xl border border-metro-red/70 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/10 px-4 py-3 shadow-[0_12px_28px_rgba(220,38,38,0.07)]">
            <StepNumber number={3} />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold text-metro-text">Validación</h2>
              <span className="rounded-full border border-amber-400/25 bg-amber-500/[0.08] px-2 py-0.5 text-[9px] font-bold text-amber-300">Trabajo principal del momento</span>
            </div>
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_210px]">
              <div className="space-y-2">
                <div className="grid gap-1.5 rounded-lg border border-metro-border bg-metro-surface/65 p-2 sm:grid-cols-4">
                  {[
                    { icon: Search, title: 'a) Revisar', value: `${pendientes} pendientes`, tone: 'amber' as const },
                    { icon: BarChart3, title: 'b) Analizar', value: `${analizadas} analizadas`, tone: 'blue' as const },
                    { icon: CheckCircle2, title: 'c) Resolver', value: `${aprobadas} aprobadas`, tone: 'green' as const },
                    { icon: Send, title: 'd) Comunicar', value: `${denegadas + desistidas} no aprobadas`, tone: 'red' as const },
                  ].map(({ icon: Icon, title, value, tone }) => (
                    <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1" key={title}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-metro-red/10 text-red-300"><Icon className="h-4 w-4" /></span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold text-metro-text">{title}</p>
                        <StatusPill label={value} tone={tone} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden rounded-lg border border-metro-border bg-metro-surface/60">
                  <div className="grid grid-cols-[1.25fr_.8fr_1.45fr_auto] gap-2 border-b border-metro-border px-3 py-1.5 text-[9px] font-bold uppercase tracking-wide text-metro-muted">
                    <span>Actividad</span><span>Estado</span><span>Detalle</span><span>Acción</span>
                  </div>
                  {[
                    { icon: Clock3, label: 'Solicitudes pendientes', status: `${pendientes} pendientes`, tone: 'amber' as const, detail: `Pendientes del periodo ${periodo}`, action: onOpenPendientes },
                    { icon: CheckCircle2, label: 'Solicitudes aprobadas', status: `${aprobadas} aprobadas`, tone: 'green' as const, detail: 'Listas para exportación', action: onOpenAprobadas },
                    { icon: XCircle, label: 'Denegadas / desistidas', status: `${denegadas + desistidas}`, tone: 'red' as const, detail: `${denegadas} denegadas · ${desistidas} desistidas`, action: onOpenDenegadas },
                    { icon: Download, label: 'Exportación Dirección', status: 'Disponible', tone: 'blue' as const, detail: 'Resumen del periodo listo para generar', action: onExportDireccion },
                  ].map(({ icon: Icon, label, status, tone, detail, action }) => (
                    <button className="grid w-full grid-cols-[1.25fr_.8fr_1.45fr_auto] items-center gap-2 border-b border-metro-border/70 px-3 py-1.5 text-left text-[10px] last:border-b-0 hover:bg-metro-raised/60" key={label} onClick={action} type="button">
                      <span className="flex min-w-0 items-center gap-2 font-semibold text-metro-secondary"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></span>
                      <StatusPill label={status} tone={tone} />
                      <span className="truncate text-metro-muted">{detail}</span>
                      <span className="whitespace-nowrap font-semibold text-blue-300">Ver detalle</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-lg border border-metro-border bg-metro-surface/75 p-3 text-center">
                <div>
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-blue-500/10 text-blue-300"><FileCheck2 className="h-6 w-6" /></span>
                  <p className="mt-2 text-xs font-bold text-metro-text">Gestiona y valida solicitudes del periodo activo</p>
                  <p className="mt-1 text-[10px] text-metro-muted">{hasPending ? `${pendientes + analizadas} solicitudes requieren seguimiento` : `${resolvedCount} solicitudes resueltas`}</p>
                </div>
                <button className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-metro-red px-3 text-[11px] font-bold text-white hover:bg-metro-dark" onClick={onOpenValidacion} type="button">
                  Abrir panel de validación <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </section>

          <section className="relative rounded-xl border border-metro-border bg-metro-panel px-4 py-3">
            <StepNumber number={4} />
            <div className="grid items-center gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-extrabold text-metro-text">Cobertura y grupos</h2><span className="rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-2 py-0.5 text-[9px] font-bold text-blue-300">Control operativo</span></div>
                <p className="mt-1 text-[10px] text-metro-muted">Equilibrio, puestos, grupos e incidencias.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-4">
                <WorkflowAction icon={TrafficCone} label={`Semáforo · ${bloqueantes} bloqueantes`} onClick={onOpenIncidencias} />
                <WorkflowAction icon={Users} label={`Grupos de cobertura · ${gruposCount}`} onClick={onOpenGrupos} />
                <WorkflowAction icon={BriefcaseBusiness} label={`Puestos · ${puestosCount}`} onClick={onOpenPuestos} />
                <WorkflowAction icon={ShieldCheck} label={`Incidencias · ${incidencias}`} onClick={onOpenIncidencias} />
              </div>
            </div>
          </section>

          <section className="relative rounded-xl border border-metro-border bg-metro-panel px-4 py-3">
            <StepNumber number={5} />
            <div className="grid items-center gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
              <div>
                <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-extrabold text-metro-text">Dirección y cierre</h2><span className="rounded-full border border-blue-400/20 bg-blue-500/[0.06] px-2 py-0.5 text-[9px] font-bold text-blue-300">Salida de información</span></div>
                <p className="mt-1 text-[10px] text-metro-muted">Revisión final, exportación y seguimiento.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={Download} label="Exportar Dirección" onClick={onExportDireccion} emphasis />
                <WorkflowAction icon={FileCheck2} label="Informe del periodo" onClick={onOpenSolicitudes} />
                <WorkflowAction icon={History} label="Histórico" onClick={onOpenHistorico} />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-2.5 lg:sticky lg:top-2 lg:self-start">
          <div className="rounded-xl border border-metro-border bg-metro-panel p-3">
            <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-blue-300" /><h3 className="text-sm font-extrabold text-metro-text">Estado del flujo</h3></div>
            <div className="space-y-2.5">
              <StatusLine label="Periodo activo configurado" state={periodo ? 'done' : 'neutral'} detail={periodo || 'Sin periodo'} />
              <StatusLine label="Solicitudes registradas" state={total > 0 ? 'done' : 'neutral'} detail={`${total} registradas`} />
              <StatusLine label="Solicitudes pendientes" state={pendientes > 0 ? 'pending' : 'done'} detail={`${pendientes} pendientes`} />
              <StatusLine label="Validación en curso" state={hasPending ? 'pending' : 'done'} detail={`${analizadas} analizadas`} />
              <StatusLine label="Cobertura revisada" state={bloqueantes === 0 ? 'done' : 'pending'} detail={`${incidencias} incidencias`} />
              <StatusLine label="Exportación a Dirección" state="neutral" detail="Disponible bajo demanda" />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.07] p-3"><p className="text-[10px] font-semibold text-blue-300">Solicitudes totales</p><p className="mt-1 text-2xl font-extrabold text-metro-text">{total}</p></div>
            <div className="rounded-xl border border-amber-400/20 bg-amber-500/[0.07] p-3"><p className="text-[10px] font-semibold text-amber-300">Pendientes de validar</p><p className="mt-1 text-2xl font-extrabold text-metro-text">{pendientes}</p></div>
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.07] p-3"><p className="text-[10px] font-semibold text-emerald-300">Aprobadas</p><p className="mt-1 text-2xl font-extrabold text-metro-text">{aprobadas}</p></div>
            <div className="rounded-xl border border-red-400/20 bg-red-500/[0.07] p-3"><p className="text-[10px] font-semibold text-red-300">Denegadas</p><p className="mt-1 text-2xl font-extrabold text-metro-text">{denegadas}</p></div>
          </div>
        </aside>
      </div>

      <div className="grid gap-2 rounded-xl border border-metro-border bg-metro-panel p-2.5 sm:grid-cols-[180px_repeat(5,minmax(0,1fr))]">
        <div className="flex items-center gap-2 px-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-metro-red/10 text-red-300"><Send className="h-4 w-4" /></span><div><p className="text-xs font-extrabold text-metro-text">Accesos rápidos</p><p className="text-[9px] text-metro-muted">Ir directamente a una vista</p></div></div>
        <WorkflowAction icon={ListChecks} label="Solicitudes" onClick={onOpenSolicitudes} />
        <WorkflowAction icon={Users} label="Cobertura" onClick={onOpenGrupos} />
        <WorkflowAction icon={TrafficCone} label="Semáforo" onClick={onOpenIncidencias} />
        <WorkflowAction icon={Download} label="Exportar" onClick={onExportDireccion} />
        <WorkflowAction icon={History} label="Histórico" onClick={onOpenHistorico} />
      </div>
    </div>
  );
}
