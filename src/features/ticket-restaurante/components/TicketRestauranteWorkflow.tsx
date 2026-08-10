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
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

function formatMoney(value: number): string {
  return value.toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
        'group flex min-h-[58px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
        emphasis
          ? 'border-metro-red/70 bg-metro-red text-white shadow-[0_10px_28px_rgba(220,38,38,0.18)] hover:bg-metro-dark'
          : 'border-metro-border bg-metro-surface text-metro-text hover:border-metro-red/70 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cx(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
          emphasis ? 'bg-white/10 text-white' : 'bg-metro-red/10 text-red-300',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-bold leading-5">{label}</span>
      <ArrowRight className="h-4 w-4 shrink-0 opacity-60 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
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
    <div className={cx('rounded-xl border p-3', toneClasses[tone])}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 shrink-0" />
        <span className="text-xs font-semibold opacity-90">{label}</span>
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tracking-tight text-metro-text">{value}</div>
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
  const iconClass =
    state === 'done'
      ? 'text-emerald-400'
      : state === 'pending'
        ? 'text-amber-400'
        : 'text-metro-muted';

  return (
    <div className="flex items-start gap-2.5">
      <Icon className={cx('mt-0.5 h-4 w-4 shrink-0', iconClass)} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-metro-secondary">{label}</p>
        {detail ? <p className="mt-0.5 text-[11px] text-metro-muted">{detail}</p> : null}
      </div>
    </div>
  );
}

function StepNumber({ number }: { number: number }) {
  return (
    <div className="absolute -left-[18px] top-4 grid h-9 w-9 place-items-center rounded-full border-4 border-metro-navy bg-metro-red text-sm font-extrabold text-white shadow-lg">
      {number}
    </div>
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
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-bold text-metro-text">Flujo de trabajo</p>
          <p className="mt-0.5 text-xs text-metro-muted">
            Configura la base anual y sigue el circuito mensual hasta el cierre de cotización.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Mes de trabajo"
            className="h-9 rounded-lg border border-metro-border bg-metro-surface px-3 text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onMonthChange(Number(event.target.value))}
            value={month}
          >
            {MONTH_OPTIONS.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="Año de trabajo"
            className="h-9 w-24 rounded-lg border border-metro-border bg-metro-surface px-3 text-center text-sm font-semibold text-metro-text outline-none focus:border-metro-red"
            max="2200"
            min="1900"
            onChange={(event) => onYearChange(Number(event.target.value) || year)}
            type="number"
            value={year}
          />
          <button
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-metro-red px-4 text-sm font-bold text-white hover:bg-metro-dark"
            onClick={onOpenMonthlyCalculation}
            type="button"
          >
            <Calculator className="h-4 w-4" />
            Ver cómputo del mes
          </button>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="relative ml-5 space-y-3 before:absolute before:bottom-6 before:left-0 before:top-6 before:w-px before:bg-gradient-to-b before:from-metro-red before:via-metro-red/40 before:to-metro-border">
          <section className="relative ml-5 rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
            <StepNumber number={1} />
            <div className="grid gap-3 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-metro-text">1. Configuración anual</h3>
                  <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                    Se configura una vez al año
                  </span>
                </div>
                <p className="mt-1 text-xs text-metro-muted">
                  Define calendarios, precio vigente y reglas base del cálculo.
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-metro-secondary">
                  <span>{activeCalendars} calendario(s) activo(s)</span>
                  <span className="text-metro-muted">·</span>
                  <span>{formatMoney(effectiveTicketPrice)} € / ticket</span>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={CalendarDays} label="Calendarios" onClick={onOpenCalendars} />
                <WorkflowAction icon={Euro} label="Precio del ticket" onClick={onOpenPrice} />
                <WorkflowAction icon={Settings} label="Reglas de cálculo" onClick={onOpenRules} />
              </div>
            </div>
          </section>

          <section className="relative ml-5 rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
            <StepNumber number={2} />
            <div className="grid gap-3 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.1fr)] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-metro-text">2. Personas con derecho</h3>
                  <span className="rounded-full border border-blue-400/20 bg-blue-400/[0.08] px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                    Base anual + ajustes durante el año
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-metro-border bg-metro-surface p-2 text-center">
                    <p className="text-xl font-extrabold text-metro-text">{activePeople}</p>
                    <p className="text-[10px] font-semibold text-metro-muted">activas</p>
                  </div>
                  <div className="rounded-lg border border-metro-border bg-metro-surface p-2 text-center">
                    <p className="text-xl font-extrabold text-metro-text">{inactivePeople}</p>
                    <p className="text-[10px] font-semibold text-metro-muted">inactivas</p>
                  </div>
                  <div className="rounded-lg border border-metro-border bg-metro-surface p-2 text-center">
                    <p className="text-xl font-extrabold text-metro-text">{activePeople + inactivePeople}</p>
                    <p className="text-[10px] font-semibold text-metro-muted">total</p>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <WorkflowAction icon={Upload} label="Importar personas" onClick={onImportPeople} />
                <WorkflowAction icon={Users} label="Gestionar personas" onClick={onOpenPeople} />
              </div>
            </div>
          </section>

          <section className="relative ml-5 rounded-xl border border-metro-red/60 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/10 p-3 shadow-[0_18px_48px_rgba(2,6,23,0.24)]">
            <StepNumber number={3} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-metro-text">3. Operativa mensual</h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    Trabajo principal del mes
                  </span>
                </div>
                <p className="mt-1 text-xs text-metro-muted">Periodo seleccionado: {monthLabel}</p>
              </div>
              <div className="rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-metro-muted">Pedido estimado</p>
                <p className="text-lg font-extrabold text-metro-text">{formatInteger(calculation.totals.ticketsFinales)} tickets</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-4">
              <button className="rounded-xl border border-metro-border bg-metro-surface p-3 text-left hover:border-metro-red/60" onClick={onImportAbsences} type="button">
                <div className="flex items-center justify-between gap-2">
                  <Upload className="h-5 w-5 text-red-300" />
                  <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', absenceCount > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-metro-raised text-metro-muted')}>
                    {absenceCount > 0 ? `${absenceCount} cargadas` : 'Sin registros'}
                  </span>
                </div>
                <p className="mt-2 text-xs font-extrabold text-metro-text">a) Importar ausencias</p>
                <p className="mt-1 text-[11px] text-metro-muted">Excel mensual de ausencias.</p>
              </button>

              <button className="rounded-xl border border-metro-border bg-metro-surface p-3 text-left hover:border-metro-red/60" onClick={onImportManutenciones} type="button">
                <div className="flex items-center justify-between gap-2">
                  <Utensils className="h-5 w-5 text-red-300" />
                  <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', manutencionCount > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
                    {manutencionCount > 0 ? `${manutencionCount} cargadas` : 'Pendiente / sin registros'}
                  </span>
                </div>
                <p className="mt-2 text-xs font-extrabold text-metro-text">b) Importar manutenciones</p>
                <p className="mt-1 text-[11px] text-metro-muted">Gastos imputados al mes.</p>
              </button>

              <button className="rounded-xl border border-metro-border bg-metro-surface p-3 text-left hover:border-metro-red/60" onClick={onOpenMonthlyCalculation} type="button">
                <div className="flex items-center justify-between gap-2">
                  <Calculator className="h-5 w-5 text-red-300" />
                  <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold', readyForCalculation ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-300')}>
                    {readyForCalculation ? 'Cómputo disponible' : 'Revisar base anual'}
                  </span>
                </div>
                <p className="mt-2 text-xs font-extrabold text-metro-text">c) Calcular cómputo mensual</p>
                <p className="mt-1 text-[11px] text-metro-muted">Pedido previsto con deuda y gastos.</p>
              </button>

              <button className="rounded-xl border border-metro-red/50 bg-metro-red/[0.06] p-3 text-left hover:bg-metro-red/[0.10]" onClick={onOpenMonthlyCalculation} type="button">
                <div className="flex items-center justify-between gap-2">
                  <Ticket className="h-5 w-5 text-red-300" />
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-300">Revisar / exportar</span>
                </div>
                <p className="mt-2 text-xs font-extrabold text-metro-text">d) Preparar pedido</p>
                <p className="mt-1 text-[11px] text-metro-muted">Abre el resultado mensual para exportarlo.</p>
              </button>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-4">
              <div className="rounded-lg border border-metro-border bg-metro-navy/30 px-3 py-2">
                <p className="text-[10px] font-semibold text-metro-muted">Ausencias</p>
                <p className="mt-0.5 text-sm font-bold text-metro-text">{absenceCount} registros</p>
              </div>
              <div className="rounded-lg border border-metro-border bg-metro-navy/30 px-3 py-2">
                <p className="text-[10px] font-semibold text-metro-muted">Manutenciones</p>
                <p className="mt-0.5 text-sm font-bold text-metro-text">{manutencionCount} registros</p>
              </div>
              <div className="rounded-lg border border-metro-border bg-metro-navy/30 px-3 py-2">
                <p className="text-[10px] font-semibold text-metro-muted">Deuda pendiente</p>
                <p className="mt-0.5 text-sm font-bold text-amber-300">{formatInteger(calculation.totals.deudaPendiente)}</p>
              </div>
              <div className="rounded-lg border border-metro-border bg-metro-navy/30 px-3 py-2">
                <p className="text-[10px] font-semibold text-metro-muted">Importe estimado</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-300">{formatMoney(calculation.totals.importe)} €</p>
              </div>
            </div>
          </section>

          <section className="relative ml-5 rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
            <StepNumber number={4} />
            <div className="grid gap-3 xl:grid-cols-[minmax(270px,0.75fr)_minmax(0,1.25fr)] xl:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-extrabold text-metro-text">4. Cierre y cotización</h3>
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.08] px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    A mes vencido
                  </span>
                </div>
                <p className="mt-1 text-xs text-metro-muted">
                  Contrasta los días realmente correspondientes y prepara el resultado de cotización.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <WorkflowAction icon={FileSpreadsheet} label="Revisar ausencias" onClick={onOpenAbsences} />
                <WorkflowAction icon={Calculator} label="Calcular cotización" onClick={onOpenContribution} />
                <WorkflowAction icon={Download} label="Exportar desde cotización" onClick={onOpenContribution} />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
            <div className="flex items-center gap-2">
              <ReceiptText className="h-5 w-5 text-red-300" />
              <h3 className="text-sm font-extrabold text-metro-text">Estado del flujo</h3>
            </div>
            <div className="mt-4 space-y-3">
              <StatusLine label="Calendarios configurados" state={activeCalendars > 0 ? 'done' : 'pending'} detail={`${activeCalendars} activos`} />
              <StatusLine label="Precio del ticket" state={effectiveTicketPrice > 0 ? 'done' : 'pending'} detail={`${formatMoney(effectiveTicketPrice)} €`} />
              <StatusLine label="Personas con derecho" state={activePeople > 0 ? 'done' : 'pending'} detail={`${activePeople} activas`} />
              <StatusLine label="Ausencias del mes" state={absenceCount > 0 ? 'done' : 'neutral'} detail={`${absenceCount} registros en ${monthLabel}`} />
              <StatusLine label="Manutenciones del mes" state={manutencionCount > 0 ? 'done' : 'neutral'} detail={`${manutencionCount} registros imputados`} />
              <StatusLine label="Cómputo mensual" state={readyForCalculation ? 'done' : 'pending'} detail={readyForCalculation ? 'Disponible para revisar' : 'Falta base de cálculo'} />
              <StatusLine label="Cotización" state={readyForCalculation ? 'neutral' : 'pending'} detail="Se revisa a mes vencido" />
            </div>
          </section>

          <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <StatCard icon={Users} label="Personas con derecho" value={formatInteger(activePeople)} tone="blue" />
            <StatCard icon={Ticket} label="Tickets previstos" value={formatInteger(calculation.totals.ticketsFinales)} tone="green" />
            <StatCard icon={Euro} label="Importe estimado" value={`${formatMoney(calculation.totals.importe)} €`} tone="purple" />
          </div>
        </aside>
      </div>

      <section className="rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="flex min-w-[170px] items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-metro-red/10 text-red-300">
              <UserPlus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-extrabold text-metro-text">Accesos rápidos</p>
              <p className="text-[10px] text-metro-muted">Ir directamente a una vista</p>
            </div>
          </div>
          <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <WorkflowAction icon={Users} label="Personas" onClick={onOpenPeople} />
            <WorkflowAction icon={CalendarDays} label="Ausencias" onClick={onOpenAbsences} />
            <WorkflowAction icon={Utensils} label="Manutenciones" onClick={onOpenManutenciones} />
            <WorkflowAction icon={Calculator} label="Cómputo cotización" onClick={onOpenContribution} />
          </div>
        </div>
      </section>
    </div>
  );
}
