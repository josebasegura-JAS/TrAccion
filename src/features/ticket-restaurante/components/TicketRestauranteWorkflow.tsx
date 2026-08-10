import {
  ArrowRight,
  CalendarDays,
  Calculator,
  CheckCircle2,
  Circle,
  Clock3,
  Download,
  Euro,
  FileSpreadsheet,
  ReceiptText,
  Settings,
  Ticket,
  Upload,
  UserPlus,
  Users,
  Utensils,
} from 'lucide-react';
import type { TicketMonthCalculation } from '../domain/ticketRestaurante';

const MONTH_OPTIONS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMoney(value: number): string {
  return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInteger(value: number): string {
  return value.toLocaleString('es-ES');
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
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
        'group flex min-h-[48px] items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition',
        emphasis
          ? 'border-metro-red bg-metro-red text-white shadow-[0_8px_20px_rgba(220,38,38,0.18)] hover:bg-metro-dark'
          : 'border-metro-border bg-metro-surface/85 text-metro-text hover:border-metro-red/60 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span className={cx(
        'grid h-8 w-8 shrink-0 place-items-center rounded-lg',
        emphasis ? 'bg-white/10 text-white' : 'bg-metro-red/10 text-red-300',
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 text-xs font-bold leading-4">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-55 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = 'blue',
}: {
  icon: typeof Users;
  label: string;
  value: string;
  tone?: 'blue' | 'green' | 'purple';
}) {
  const toneClasses = {
    blue: 'border-blue-400/20 bg-blue-500/[0.07] text-blue-300',
    green: 'border-emerald-400/20 bg-emerald-500/[0.07] text-emerald-300',
    purple: 'border-fuchsia-400/20 bg-fuchsia-500/[0.07] text-fuchsia-300',
  };

  return (
    <div className={cx('rounded-lg border px-3 py-2.5', toneClasses[tone])}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-[10px] font-semibold opacity-90">{label}</span>
      </div>
      <div className="mt-1 text-xl font-extrabold tracking-tight text-metro-text">{value}</div>
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
  const iconClass = state === 'done' ? 'text-emerald-400' : state === 'pending' ? 'text-amber-400' : 'text-metro-muted';

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

function StepNumber({ number }: { number: number }) {
  return (
    <div className="absolute -left-[30px] top-3 z-10 grid h-8 w-8 place-items-center rounded-full border-[3px] border-metro-navy bg-metro-red text-xs font-extrabold text-white shadow-lg">
      {number}
    </div>
  );
}

function FlowStep({
  icon: Icon,
  title,
  detail,
  status,
  statusTone,
  onClick,
  highlighted = false,
}: {
  icon: typeof Upload;
  title: string;
  detail: string;
  status: string;
  statusTone: 'done' | 'pending' | 'info';
  onClick: () => void;
  highlighted?: boolean;
}) {
  const statusClasses = {
    done: 'bg-emerald-500/10 text-emerald-300',
    pending: 'bg-amber-500/10 text-amber-300',
    info: 'bg-blue-500/10 text-blue-300',
  };

  return (
    <button
      className={cx(
        'group min-w-0 rounded-lg border p-2.5 text-left transition',
        highlighted
          ? 'border-metro-red/60 bg-metro-red/[0.055] hover:bg-metro-red/[0.09]'
          : 'border-metro-border bg-metro-surface/80 hover:border-metro-red/55 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-metro-red/10 text-red-300">
          <Icon className="h-4 w-4" />
        </span>
        <span className={cx('max-w-[70%] truncate rounded-full px-2 py-0.5 text-[9px] font-bold', statusClasses[statusTone])}>{status}</span>
      </div>
      <p className="mt-1.5 text-[11px] font-extrabold leading-4 text-metro-text">{title}</p>
      <p className="mt-0.5 line-clamp-1 text-[10px] leading-4 text-metro-muted">{detail}</p>
    </button>
  );
}

export interface TicketRestauranteWorkflowProps {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  activeCalendars: number;
  activePeople: number;
  inactivePeople: number;
  absenceCount: number;
  manutencionCount: number;
  effectiveTicketPrice: number;
  calculation: TicketMonthCalculation;
  onOpenCalendars: () => void;
  onOpenPrice: () => void;
  onOpenRules: () => void;
  onOpenPeople: () => void;
  onImportPeople: () => void;
  onOpenAbsences: () => void;
  onImportAbsences: () => void;
  onOpenManutenciones: () => void;
  onImportManutenciones: () => void;
  onOpenMonthlyCalculation: () => void;
  onOpenContribution: () => void;
}

export function TicketRestauranteWorkflow({
  year,
  month,
  onYearChange,
  onMonthChange,
  activeCalendars,
  activePeople,
  inactivePeople,
  absenceCount,
  manutencionCount,
  effectiveTicketPrice,
  calculation,
  onOpenCalendars,
  onOpenPrice,
  onOpenRules,
  onOpenPeople,
  onImportPeople,
  onOpenAbsences,
  onImportAbsences,
  onOpenManutenciones,
  onImportManutenciones,
  onOpenMonthlyCalculation,
  onOpenContribution,
}: TicketRestauranteWorkflowProps) {
  const readyForCalculation = activeCalendars > 0 && activePeople > 0;
  const monthLabel = `${MONTH_OPTIONS[month - 1] ?? month} ${year}`;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-col gap-2 rounded-lg border border-metro-border bg-metro-panel px-3 py-2 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-metro-text">Flujo de trabajo</p>
          <p className="text-[11px] text-metro-muted">Base anual → operativa mensual → cierre de cotización</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Mes de trabajo"
            className="h-8 min-w-[130px] rounded-lg border border-metro-border bg-metro-surface px-3 text-xs font-semibold text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onMonthChange(Number(event.target.value))}
            value={month}
          >
            {MONTH_OPTIONS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
          </select>
          <input
            aria-label="Año de trabajo"
            className="h-8 w-20 rounded-lg border border-metro-border bg-metro-surface px-2 text-center text-xs font-semibold text-metro-text outline-none focus:border-metro-red"
            max="2200"
            min="1900"
            onChange={(event) => onYearChange(Number(event.target.value) || year)}
            type="number"
            value={year}
          />
          <button
            className="inline-flex h-8 items-center gap-2 rounded-lg bg-metro-red px-3 text-xs font-bold text-white hover:bg-metro-dark"
            onClick={onOpenMonthlyCalculation}
            type="button"
          >
            <Calculator className="h-3.5 w-3.5" />
            Ver cómputo
          </button>
        </div>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="relative ml-7 space-y-2.5 before:absolute before:bottom-5 before:left-0 before:top-5 before:w-px before:bg-gradient-to-b before:from-metro-red/90 before:via-metro-red/35 before:to-metro-border">
          <section className="relative ml-4 rounded-lg border border-metro-border bg-metro-panel px-3 py-2.5 shadow-card">
            <StepNumber number={1} />
            <div className="grid gap-2.5 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] md:items-center">
              <div className="pl-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-metro-text">Configuración anual</h3>
                  <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-2 py-0.5 text-[9px] font-semibold text-blue-300">Una vez al año</span>
                </div>
                <p className="mt-0.5 text-[10px] text-metro-muted">Calendarios, precio y reglas base.</p>
                <p className="mt-1 text-[10px] font-semibold text-metro-secondary">{activeCalendars} calendarios · {formatMoney(effectiveTicketPrice)} €/ticket</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={CalendarDays} label="Calendarios" onClick={onOpenCalendars} />
                <WorkflowAction icon={Euro} label="Precio del ticket" onClick={onOpenPrice} />
                <WorkflowAction icon={Settings} label="Reglas de cálculo" onClick={onOpenRules} />
              </div>
            </div>
          </section>

          <section className="relative ml-4 rounded-lg border border-metro-border bg-metro-panel px-3 py-2.5 shadow-card">
            <StepNumber number={2} />
            <div className="grid gap-2.5 md:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)] md:items-center">
              <div className="pl-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-metro-text">Personas con derecho</h3>
                  <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-2 py-0.5 text-[9px] font-semibold text-blue-300">Base anual + ajustes</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {[
                    [activePeople, 'activas'],
                    [inactivePeople, 'inactivas'],
                    [activePeople + inactivePeople, 'total'],
                  ].map(([value, label]) => (
                    <div key={String(label)} className="rounded-md border border-metro-border bg-metro-surface/75 px-2 py-1.5 text-center">
                      <p className="text-base font-extrabold leading-5 text-metro-text">{value}</p>
                      <p className="text-[9px] font-semibold text-metro-muted">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <WorkflowAction icon={Upload} label="Importar personas" onClick={onImportPeople} />
                <WorkflowAction icon={Users} label="Gestionar personas" onClick={onOpenPeople} />
              </div>
            </div>
          </section>

          <section className="relative ml-4 rounded-lg border border-metro-red/60 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/10 px-3 py-2.5 shadow-[0_14px_34px_rgba(2,6,23,0.24)]">
            <StepNumber number={3} />
            <div className="flex flex-wrap items-start justify-between gap-2 pl-1">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-metro-text">Operativa mensual</h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[9px] font-semibold text-amber-300">Trabajo principal del mes</span>
                </div>
                <p className="mt-0.5 text-[10px] text-metro-muted">{monthLabel}</p>
              </div>
              <div className="rounded-md border border-metro-border bg-metro-surface/80 px-3 py-1.5 text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-metro-muted">Pedido estimado</p>
                <p className="text-base font-extrabold leading-5 text-metro-text">{formatInteger(calculation.totals.ticketsFinales)} tickets</p>
              </div>
            </div>

            <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              <FlowStep icon={Upload} title="a) Importar ausencias" detail="Excel mensual" status={absenceCount > 0 ? `${absenceCount} cargadas` : 'Sin registros'} statusTone={absenceCount > 0 ? 'done' : 'info'} onClick={onImportAbsences} />
              <FlowStep icon={Utensils} title="b) Importar manutenciones" detail="Gastos del mes" status={manutencionCount > 0 ? `${manutencionCount} cargadas` : 'Pendiente'} statusTone={manutencionCount > 0 ? 'done' : 'pending'} onClick={onImportManutenciones} />
              <FlowStep icon={Calculator} title="c) Calcular cómputo" detail="Pedido previsto" status={readyForCalculation ? 'Disponible' : 'Revisar base'} statusTone={readyForCalculation ? 'done' : 'pending'} onClick={onOpenMonthlyCalculation} />
              <FlowStep icon={Ticket} title="d) Preparar pedido" detail="Revisar y exportar" status="Revisar / exportar" statusTone="info" onClick={onOpenMonthlyCalculation} highlighted />
            </div>

            <div className="mt-2 grid gap-1.5 grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border border-metro-border bg-metro-navy/25 px-2.5 py-1.5"><p className="text-[9px] text-metro-muted">Ausencias</p><p className="text-xs font-bold text-metro-text">{absenceCount} registros</p></div>
              <div className="rounded-md border border-metro-border bg-metro-navy/25 px-2.5 py-1.5"><p className="text-[9px] text-metro-muted">Manutenciones</p><p className="text-xs font-bold text-metro-text">{manutencionCount} registros</p></div>
              <div className="rounded-md border border-metro-border bg-metro-navy/25 px-2.5 py-1.5"><p className="text-[9px] text-metro-muted">Deuda pendiente</p><p className="text-xs font-bold text-amber-300">{formatInteger(calculation.totals.deudaPendiente)}</p></div>
              <div className="rounded-md border border-metro-border bg-metro-navy/25 px-2.5 py-1.5"><p className="text-[9px] text-metro-muted">Importe estimado</p><p className="text-xs font-bold text-emerald-300">{formatMoney(calculation.totals.importe)} €</p></div>
            </div>
          </section>

          <section className="relative ml-4 rounded-lg border border-metro-border bg-metro-panel px-3 py-2.5 shadow-card">
            <StepNumber number={4} />
            <div className="grid gap-2.5 md:grid-cols-[minmax(220px,0.75fr)_minmax(0,1.25fr)] md:items-center">
              <div className="pl-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-extrabold text-metro-text">Cierre y cotización</h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[9px] font-semibold text-amber-300">A mes vencido</span>
                </div>
                <p className="mt-0.5 text-[10px] text-metro-muted">Contrasta el mes real y prepara la cotización.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={FileSpreadsheet} label="Revisar ausencias" onClick={onOpenAbsences} />
                <WorkflowAction icon={Calculator} label="Calcular cotización" onClick={onOpenContribution} />
                <WorkflowAction icon={Download} label="Exportar resultado" onClick={onOpenContribution} />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-2.5 lg:sticky lg:top-2 lg:self-start">
          <section className="rounded-lg border border-metro-border bg-metro-panel p-3 shadow-card">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-red-300" />
              <h3 className="text-xs font-extrabold text-metro-text">Estado del flujo</h3>
            </div>
            <div className="mt-2.5 space-y-2">
              <StatusLine label="Calendarios configurados" state={activeCalendars > 0 ? 'done' : 'pending'} detail={`${activeCalendars} activos`} />
              <StatusLine label="Precio del ticket" state={effectiveTicketPrice > 0 ? 'done' : 'pending'} detail={`${formatMoney(effectiveTicketPrice)} €`} />
              <StatusLine label="Personas revisadas" state={activePeople > 0 ? 'done' : 'pending'} detail={`${activePeople} activas`} />
              <StatusLine label="Ausencias importadas" state={absenceCount > 0 ? 'done' : 'neutral'} detail={`${absenceCount} en ${monthLabel}`} />
              <StatusLine label="Manutenciones importadas" state={manutencionCount > 0 ? 'done' : 'pending'} detail={`${manutencionCount} imputadas`} />
              <StatusLine label="Cómputo mensual" state={readyForCalculation ? 'done' : 'pending'} detail={readyForCalculation ? 'Disponible' : 'Falta base anual'} />
              <StatusLine label="Cotización" state="neutral" detail="A mes vencido" />
            </div>
          </section>

          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard icon={Users} label="Personas con derecho" value={formatInteger(activePeople)} tone="blue" />
            <StatCard icon={Ticket} label="Tickets previstos" value={formatInteger(calculation.totals.ticketsFinales)} tone="green" />
            <StatCard icon={Euro} label="Importe estimado" value={`${formatMoney(calculation.totals.importe)} €`} tone="purple" />
          </div>
        </aside>
      </div>

      <section className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2">
        <div className="grid gap-2 lg:grid-cols-[170px_repeat(4,minmax(0,1fr))] lg:items-center">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-metro-red/10 text-red-300"><UserPlus className="h-3.5 w-3.5" /></span>
            <div><p className="text-xs font-extrabold text-metro-text">Accesos rápidos</p><p className="text-[9px] text-metro-muted">Ir a una vista</p></div>
          </div>
          <WorkflowAction icon={Users} label="Personas" onClick={onOpenPeople} />
          <WorkflowAction icon={CalendarDays} label="Ausencias" onClick={onOpenAbsences} />
          <WorkflowAction icon={Utensils} label="Manutenciones" onClick={onOpenManutenciones} />
          <WorkflowAction icon={Calculator} label="Cómputo cotización" onClick={onOpenContribution} />
        </div>
      </section>
    </div>
  );
}
