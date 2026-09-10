import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Euro,
  FileSpreadsheet,
  ReceiptText,
  Settings,
  Ticket,
  Upload,
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

type StepState = 'done' | 'current' | 'pending';

function ProcessStep({
  number,
  title,
  detail,
  state,
  onClick,
}: {
  number: number;
  title: string;
  detail: string;
  state: StepState;
  onClick: () => void;
}) {
  return (
    <button
      className={cx(
        'group relative flex min-h-[76px] min-w-0 flex-1 items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
        state === 'current'
          ? 'border-metro-red bg-metro-red/[0.075] shadow-[0_10px_24px_rgba(220,38,38,0.12)]'
          : state === 'done'
            ? 'border-emerald-500/25 bg-emerald-500/[0.045] hover:border-emerald-400/45'
            : 'border-metro-border bg-metro-surface/60 hover:border-metro-red/45 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-extrabold',
          state === 'done'
            ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
            : state === 'current'
              ? 'border-metro-red bg-metro-red text-white'
              : 'border-metro-border bg-metro-panel text-metro-muted',
        )}
      >
        {state === 'done' ? <Check className="h-4 w-4" /> : number}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-extrabold leading-4 text-metro-text">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-metro-muted">{detail}</span>
      </span>
    </button>
  );
}

function AdvancedAction({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: typeof CalendarDays;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      className="group flex min-h-[62px] items-center gap-3 rounded-lg border border-metro-border bg-metro-surface/55 px-3 py-2.5 text-left transition hover:border-metro-red/50 hover:bg-metro-raised"
      onClick={onClick}
      type="button"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-metro-red/10 text-red-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-metro-text">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-metro-muted">{detail}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-metro-muted transition group-hover:translate-x-0.5 group-hover:text-metro-text" />
    </button>
  );
}

function ReviewCheck({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-metro-border bg-metro-surface/45 px-3 py-2.5 transition hover:bg-metro-raised">
      <input
        checked={checked}
        className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-bold text-metro-text">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-metro-muted">{detail}</span>
      </span>
    </label>
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
  manualDebtCount: number;
  absencesReviewed: boolean;
  manutencionesReviewed: boolean;
  manualDebtsReviewed: boolean;
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
  onOpenManualDebt: () => void;
  onImportManutenciones: () => void;
  onOpenMonthlyCalculation: () => void;
  onOpenContribution: () => void;
  onOpenAnnualBalance: () => void;
  onReviewChange: (kind: 'absencesReviewed' | 'manutencionesReviewed' | 'manualDebtsReviewed', checked: boolean) => void;
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
  manualDebtCount,
  absencesReviewed,
  manutencionesReviewed,
  manualDebtsReviewed,
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
  onOpenManualDebt,
  onImportManutenciones,
  onOpenMonthlyCalculation,
  onOpenContribution,
  onOpenAnnualBalance,
  onReviewChange,
}: TicketRestauranteWorkflowProps) {
  const baseReady = activeCalendars > 0 && activePeople > 0 && effectiveTicketPrice > 0;
  const monthlyInputsReviewed = absencesReviewed && manutencionesReviewed;
  const adjustmentsReviewed = manualDebtsReviewed;
  const readyForOrder = baseReady && monthlyInputsReviewed && adjustmentsReviewed;
  const monthLabel = `${MONTH_OPTIONS[month - 1] ?? month} ${year}`;

  const nextAction = !baseReady
    ? {
        eyebrow: 'Antes de empezar el mes',
        title: 'Completa la configuración base',
        detail: 'Necesitas al menos un calendario activo, personas con derecho y un precio de ticket válido.',
        button: 'Revisar configuración',
        icon: Settings,
        onClick: activeCalendars === 0 ? onOpenCalendars : activePeople === 0 ? onOpenPeople : onOpenPrice,
      }
    : !absencesReviewed
      ? {
          eyebrow: 'Siguiente paso recomendado',
          title: 'Cargar y revisar ausencias',
          detail: absenceCount > 0
            ? `Ya hay ${absenceCount} registros en ${monthLabel}. Entra, compruébalos y marca la revisión como completada. Origen del fichero: Zerkos → Supervisión → Justif. Ausencias de Día.`
            : `Importa el fichero de ausencias correspondiente a ${monthLabel}. Origen: Zerkos → Supervisión → Justif. Ausencias de Día.`,
          button: absenceCount > 0 ? 'Revisar ausencias' : 'Cargar ausencias',
          icon: Upload,
          onClick: absenceCount > 0 ? onOpenAbsences : onImportAbsences,
        }
      : !manutencionesReviewed
        ? {
            eyebrow: 'Siguiente paso recomendado',
            title: 'Cargar y revisar manutenciones',
            detail: manutencionCount > 0
              ? `Hay ${manutencionCount} manutenciones imputadas. Revisa el resultado antes de continuar.`
              : `Importa las notas de gasto que afectan a ticket para ${monthLabel}. Si no hay ninguna, puedes marcar este paso como revisado.`,
            button: manutencionCount > 0 ? 'Revisar manutenciones' : 'Cargar manutenciones',
            icon: Utensils,
            onClick: manutencionCount > 0 ? onOpenManutenciones : onImportManutenciones,
          }
        : !manualDebtsReviewed
          ? {
              eyebrow: 'Siguiente paso recomendado',
              title: 'Revisar deudas y ajustes',
              detail: manualDebtCount > 0
                ? `Hay ${manualDebtCount} deuda(s) o ajuste(s) manuales activos. Comprueba que deban aplicarse antes de preparar el pedido.`
                : 'No hay ajustes manuales activos. Confirma la revisión para cerrar este control.',
              button: 'Revisar deudas y ajustes',
              icon: ReceiptText,
              onClick: onOpenManualDebt,
            }
          : {
              eyebrow: 'Pedido preparado para revisión',
              title: `Revisar el pedido de ${monthLabel}`,
              detail: `${formatInteger(calculation.totals.ticketsFinales)} tickets · ${formatMoney(calculation.totals.importe)} €. Comprueba el detalle y genera el fichero “A cargar”.`,
              button: 'Revisar y generar A cargar',
              icon: Calculator,
              onClick: onOpenMonthlyCalculation,
            };

  const NextIcon = nextAction.icon;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-extrabold text-metro-text">Proceso mensual de Ticket Restaurante</p>
            <p className="mt-1 text-xs text-metro-muted">Sigue los pasos en orden. La aplicación te indicará qué toca hacer a continuación.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Mes de trabajo"
              className="h-9 min-w-[145px] rounded-lg border border-metro-border bg-metro-surface px-3 text-[13px] font-semibold text-metro-text outline-none focus:border-metro-red"
              onChange={(event) => onMonthChange(Number(event.target.value))}
              value={month}
            >
              {MONTH_OPTIONS.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
            <input
              aria-label="Año de trabajo"
              className="h-9 w-24 rounded-lg border border-metro-border bg-metro-surface px-2 text-center text-[13px] font-semibold text-metro-text outline-none focus:border-metro-red"
              max="2200"
              min="1900"
              onChange={(event) => onYearChange(Number(event.target.value) || year)}
              type="number"
              value={year}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          <ProcessStep
            detail={`${activeCalendars} calendarios · ${activePeople} personas`}
            number={1}
            onClick={onOpenPeople}
            state={baseReady ? 'done' : 'current'}
            title="Base preparada"
          />
          <ProcessStep
            detail={absencesReviewed ? `${absenceCount} registros revisados` : absenceCount > 0 ? `${absenceCount} registros pendientes de revisión` : 'Desde Zerkos · Justif. Ausencias de Día'}
            number={2}
            onClick={absenceCount > 0 ? onOpenAbsences : onImportAbsences}
            state={absencesReviewed ? 'done' : baseReady ? 'current' : 'pending'}
            title="Ausencias"
          />
          <ProcessStep
            detail={manutencionesReviewed ? `${manutencionCount} registros revisados` : manutencionCount > 0 ? `${manutencionCount} registros pendientes de revisión` : 'Pendiente de carga o revisión'}
            number={3}
            onClick={manutencionCount > 0 ? onOpenManutenciones : onImportManutenciones}
            state={manutencionesReviewed ? 'done' : absencesReviewed ? 'current' : 'pending'}
            title="Manutenciones"
          />
          <ProcessStep
            detail={manualDebtsReviewed ? 'Control revisado' : manualDebtCount > 0 ? `${manualDebtCount} ajustes activos` : 'Pendiente de revisión'}
            number={4}
            onClick={onOpenManualDebt}
            state={manualDebtsReviewed ? 'done' : monthlyInputsReviewed ? 'current' : 'pending'}
            title="Deudas y ajustes"
          />
          <ProcessStep
            detail={`${formatInteger(calculation.totals.ticketsFinales)} tickets · ${formatMoney(calculation.totals.importe)} €`}
            number={5}
            onClick={onOpenMonthlyCalculation}
            state={readyForOrder ? 'current' : 'pending'}
            title="Revisar pedido"
          />
          <ProcessStep
            detail="A mes vencido"
            number={6}
            onClick={onOpenContribution}
            state="pending"
            title="Cotización"
          />
        </div>
      </section>

      <section className={cx(
        'rounded-xl border p-4 shadow-card',
        readyForOrder
          ? 'border-emerald-400/30 bg-emerald-500/[0.055]'
          : 'border-metro-red/45 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/10',
      )}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cx(
              'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
              readyForOrder ? 'bg-emerald-500/15 text-emerald-300' : 'bg-metro-red/12 text-red-300',
            )}>
              {readyForOrder ? <CheckCircle2 className="h-5 w-5" /> : <NextIcon className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className={cx('text-[11px] font-bold uppercase tracking-[0.08em]', readyForOrder ? 'text-emerald-300' : 'text-red-300')}>{nextAction.eyebrow}</p>
              <h2 className="mt-1 text-lg font-extrabold leading-6 text-metro-text">{nextAction.title}</h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-metro-secondary">{nextAction.detail}</p>
            </div>
          </div>
          <button
            className={cx(
              'inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-extrabold transition',
              readyForOrder
                ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                : 'bg-metro-red text-white hover:bg-metro-dark',
            )}
            onClick={nextAction.onClick}
            type="button"
          >
            {nextAction.button}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-metro-text">Controles del mes</p>
              <p className="mt-0.5 text-[11px] text-metro-muted">Marca cada bloque cuando hayas comprobado que sus datos son correctos.</p>
            </div>
            <span className="rounded-full border border-metro-border bg-metro-surface px-2.5 py-1 text-[11px] font-bold text-metro-secondary">
              {[absencesReviewed, manutencionesReviewed, manualDebtsReviewed].filter(Boolean).length}/3 revisados
            </span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <ReviewCheck
              checked={absencesReviewed}
              detail={absenceCount > 0 ? `${absenceCount} registros en ${monthLabel}` : `Sin registros en ${monthLabel}`}
              label="Ausencias"
              onChange={(checked) => onReviewChange('absencesReviewed', checked)}
            />
            <ReviewCheck
              checked={manutencionesReviewed}
              detail={manutencionCount > 0 ? `${manutencionCount} manutenciones imputadas` : 'Sin manutenciones registradas'}
              label="Manutenciones"
              onChange={(checked) => onReviewChange('manutencionesReviewed', checked)}
            />
            <ReviewCheck
              checked={manualDebtsReviewed}
              detail={manualDebtCount > 0 ? `${manualDebtCount} ajustes activos` : 'Sin ajustes manuales activos'}
              label="Deudas y ajustes"
              onChange={(checked) => onReviewChange('manualDebtsReviewed', checked)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
          <p className="text-sm font-extrabold text-metro-text">Resumen del pedido</p>
          <div className="mt-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[12px] text-metro-muted"><Users className="h-4 w-4" />Personas con derecho</span><strong className="text-sm text-metro-text">{formatInteger(activePeople)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[12px] text-metro-muted"><Ticket className="h-4 w-4" />Tickets previstos</span><strong className="text-sm text-metro-text">{formatInteger(calculation.totals.ticketsFinales)}</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[12px] text-metro-muted"><Euro className="h-4 w-4" />Importe estimado</span><strong className="text-sm text-emerald-300">{formatMoney(calculation.totals.importe)} €</strong></div>
            <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[12px] text-metro-muted"><Clock3 className="h-4 w-4" />Deuda pendiente</span><strong className="text-sm text-amber-300">{formatInteger(calculation.totals.deudaPendiente)}</strong></div>
          </div>
        </section>
      </div>

      <button
        className="group flex w-full items-center justify-between gap-4 rounded-xl border border-blue-400/25 bg-blue-500/[0.055] p-4 text-left shadow-card transition hover:border-blue-300/45 hover:bg-blue-500/[0.085]"
        onClick={onOpenAnnualBalance}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/12 text-blue-200">
            <BarChart3 className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-extrabold text-metro-text">Balance anual</span>
            <span className="mt-0.5 block text-[11px] leading-4 text-metro-muted">Consulta el acumulado del año, evolución mensual, reparto por área y detalle por persona. Exportable a Excel.</span>
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-blue-200">
          Abrir balance <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </button>

      <details className="group rounded-xl border border-metro-border bg-metro-panel shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-metro-surface text-metro-secondary"><Settings className="h-4 w-4" /></span>
            <div>
              <p className="text-[13px] font-extrabold text-metro-text">Configuración y herramientas avanzadas</p>
              <p className="mt-0.5 text-[11px] text-metro-muted">Calendarios, personas, precio, reglas y accesos de mantenimiento.</p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-metro-muted transition group-open:rotate-180" />
        </summary>
        <div className="border-t border-metro-border px-4 py-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <AdvancedAction icon={CalendarDays} title="Calendarios" detail={`${activeCalendars} activos. Mantén aquí la base anual.`} onClick={onOpenCalendars} />
            <AdvancedAction icon={Users} title="Personas" detail={`${activePeople} activas · ${inactivePeople} inactivas.`} onClick={onOpenPeople} />
            <AdvancedAction icon={Upload} title="Importar personas" detail="Actualiza en bloque las personas con derecho." onClick={onImportPeople} />
            <AdvancedAction icon={Euro} title="Precio del ticket" detail={`Precio aplicado: ${formatMoney(effectiveTicketPrice)} €.`} onClick={onOpenPrice} />
            <AdvancedAction icon={Settings} title="Reglas de cálculo" detail="Fechas, deuda y reglas generales del módulo." onClick={onOpenRules} />
            <AdvancedAction icon={FileSpreadsheet} title="Todas las ausencias" detail="Consulta, corrige o elimina registros importados." onClick={onOpenAbsences} />
            <AdvancedAction icon={Utensils} title="Todas las manutenciones" detail="Consulta las notas de gasto que afectan a ticket." onClick={onOpenManutenciones} />
            <AdvancedAction icon={ReceiptText} title="Deudas y regularizaciones" detail="Gestiona deuda manual y correcciones de saldo." onClick={onOpenManualDebt} />
          </div>
        </div>
      </details>
    </div>
  );
}
