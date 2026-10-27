import { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Calculator,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  X,
  Check,
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
  reviewed,
  onReviewChange,
}: {
  number: number;
  title: string;
  detail: string;
  state: StepState;
  onClick: () => void;
  reviewed?: boolean;
  onReviewChange?: (checked: boolean) => void;
}) {
  return (
    <div
      className={cx(
        'group relative flex min-h-[76px] min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
        state === 'current'
          ? 'border-metro-red bg-metro-red/[0.075] shadow-[0_10px_24px_rgba(220,38,38,0.12)]'
          : state === 'done'
            ? 'border-emerald-500/25 bg-emerald-500/[0.045] hover:border-emerald-400/45'
            : 'border-metro-border bg-metro-surface/60 hover:border-metro-red/45 hover:bg-metro-raised',
      )}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={0}
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
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block text-[13px] font-extrabold leading-4 text-metro-text">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-metro-muted">{detail}</span>
        {onReviewChange ? (
          <span
            className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-metro-secondary"
            onClick={(event) => event.stopPropagation()}
          >
            <input
              aria-label={`Marcar ${title} como revisado`}
              checked={Boolean(reviewed)}
              className="h-3.5 w-3.5 accent-emerald-500"
              onChange={(event) => onReviewChange(event.target.checked)}
              type="checkbox"
            />
            {reviewed ? 'Revisado' : 'Marcar revisado'}
          </span>
        ) : null}
      </span>
    </div>
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
        <span className="mt-0.5 block text-xs leading-5 text-metro-muted">{detail}</span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-metro-muted transition group-hover:translate-x-0.5 group-hover:text-metro-text" />
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
  manualDebtCount: number;
  absencesReviewed: boolean;
  manutencionesReviewed: boolean;
  manualDebtsReviewed: boolean;
  effectiveTicketPrice: number;
  calculation: TicketMonthCalculation;
  orderedTickets?: number;
  initialOrderedTickets?: number;
  orderMovementsCount?: number;
  historicalOrderAmount?: number;
  orderRows?: Array<{ empleado: string; nombreApellidos: string; tickets: number; amount?: number }>;
  orderMovementRows?: Array<{ id: string; empleado?: string; nombreApellidos?: string; tickets: number; amount?: number; reason: string; date: string }>;
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
  orderedTickets,
  initialOrderedTickets,
  orderMovementsCount = 0,
  historicalOrderAmount,
  orderRows = [],
  orderMovementRows = [],
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
  const [showOrderDetail, setShowOrderDetail] = useState(false);
  const baseReady = activeCalendars > 0 && activePeople > 0 && effectiveTicketPrice > 0;
  const monthlyInputsReviewed = absencesReviewed && manutencionesReviewed;
  const adjustmentsReviewed = manualDebtsReviewed;
  const readyForOrder = baseReady && monthlyInputsReviewed && adjustmentsReviewed;
  const actualOrderedAmount = historicalOrderAmount;
  const monthLabel = `${MONTH_OPTIONS[month - 1] ?? month} ${year}`;
  const orderRegistered = typeof orderedTickets === 'number';

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
              eyebrow: orderRegistered ? 'Pedido realizado' : 'Pedido preparado para revisión',
              title: orderRegistered ? `Pedido de ${monthLabel} registrado` : `Revisar el pedido de ${monthLabel}`,
              detail: orderRegistered ? `${formatInteger(orderedTickets)} tickets realmente solicitados. Entra para registrar pedidos adicionales o correcciones.` : `${formatInteger(calculation.totals.ticketsFinales)} tickets · ${formatMoney(calculation.totals.importe)} €. Comprueba el detalle y genera el fichero “A cargar”.`,
              button: orderRegistered ? 'Ver pedido y movimientos' : 'Revisar y generar A cargar',
              icon: Calculator,
              onClick: onOpenMonthlyCalculation,
            };

  const NextIcon = nextAction.icon;

  return (
    <div className="space-y-3">

      <section className="flex flex-col gap-2 rounded-xl border border-metro-border bg-metro-panel px-3 py-2 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-red-300" /><span className="text-sm font-extrabold text-metro-text">Mes de trabajo</span></div>
          <button aria-label="Mes anterior" title="Mes anterior" type="button" className="rounded-lg border border-metro-border px-3 py-2 text-metro-text hover:border-metro-red" onClick={() => { if (month === 1) { onYearChange(year - 1); onMonthChange(12); } else onMonthChange(month - 1); }}><ChevronLeft size={17}/></button>
          <select aria-label="Mes de trabajo" className="h-10 min-w-[150px] rounded-lg border border-metro-red/50 bg-metro-surface px-3 text-sm font-extrabold text-metro-text" onChange={event => onMonthChange(Number(event.target.value))} value={month}>
            {MONTH_OPTIONS.map((name,index) => <option key={name} value={index+1}>{name}</option>)}
          </select>
          <input aria-label="Año de trabajo" className="h-10 w-24 rounded-lg border border-metro-border bg-metro-surface px-2 text-center text-sm font-bold text-metro-text" type="number" min="1900" max="2200" value={year} onChange={event=>onYearChange(Number(event.target.value)||year)} />
          <button aria-label="Mes siguiente" title="Mes siguiente" type="button" className="rounded-lg border border-metro-border px-3 py-2 text-metro-text hover:border-metro-red" onClick={() => { if(month===12){onYearChange(year+1);onMonthChange(1);}else onMonthChange(month+1); }}><ChevronRight size={17}/></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
          <span className="rounded-md border border-metro-border px-2 py-1 text-metro-muted">Meses pasados: registros disponibles</span>
          <span className="rounded-md border border-metro-red/40 bg-metro-red/10 px-2 py-1 text-red-300">Actual y próximo: gestión mensual</span>
          <span className="rounded-md border border-blue-500/30 px-2 py-1 text-blue-300">Meses futuros: previsión</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {([
          {title:'Personas activas', value:formatInteger(activePeople), Icon:Users, action:onOpenPeople},
          {title:'Calendarios activos',value:formatInteger(activeCalendars), Icon:CalendarDays,action:onOpenCalendars},
          {title:'Precio del ticket',value:formatMoney(effectiveTicketPrice)+' €',Icon:Ticket,action:onOpenPrice},
          {title:'Tickets calculados',value:formatInteger(calculation.totals.ticketsFinales),Icon:Calculator,action:onOpenMonthlyCalculation},
          {title:'Importe calculado',value:formatMoney(calculation.totals.importe)+' €',Icon:Euro,action:onOpenMonthlyCalculation},
        ]).map(({title,value,Icon,action})=><button type="button" key={title} onClick={action} className="flex min-w-0 items-center gap-2 rounded-xl border border-metro-border bg-metro-panel p-3 text-left shadow-card transition hover:border-metro-red/50">
          <span className="rounded-lg bg-metro-red/10 p-2 text-red-300"><Icon size={18}/></span><span className="min-w-0"><span className="block text-[11px] text-metro-muted">{title}</span><strong className="block truncate text-lg text-metro-text">{value}</strong></span>
        </button>)}
      </section>

      <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="rounded-lg bg-metro-red/10 p-2 text-red-300"><ReceiptText size={19}/></span><div><h2 className="text-base font-extrabold text-metro-text">Pedido mensual — {monthLabel}</h2><p className="text-[11px] text-metro-muted">El cálculo previsto y el pedido efectivamente registrado se muestran por separado.</p></div></div>
          <span className={cx('rounded-full border px-3 py-1 text-xs font-bold',orderRegistered?'border-emerald-500/35 bg-emerald-500/10 text-emerald-300':'border-amber-500/35 bg-amber-500/10 text-amber-300')}>{orderRegistered?'Pedido realizado':'Pedido pendiente de registrar'}</span>
        </div>
        <div className="mt-3 flex flex-col gap-3 xl:flex-row">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-px overflow-hidden rounded-xl border border-metro-border bg-metro-border sm:grid-cols-3 2xl:grid-cols-6">
            {[
              ['Cálculo actual',formatInteger(calculation.totals.ticketsFinales),'tickets'],
              ['Pedido inicial',initialOrderedTickets===undefined?'—':formatInteger(initialOrderedTickets),'tickets'],
              ['Movimientos',orderRegistered?formatInteger((orderedTickets??0)-(initialOrderedTickets??0)):'—',orderRegistered?orderMovementsCount+' movimientos':'sin registrar'],
              ['Total solicitado',orderRegistered?formatInteger(orderedTickets??0):'—','tickets'],
              ['Diferencia vs cálculo',orderRegistered?formatInteger((orderedTickets??0)-calculation.totals.ticketsFinales):'—','tickets'],
              [orderRegistered?'Importe pedido':'Importe previsto',formatMoney(orderRegistered?(actualOrderedAmount??calculation.totals.importe):calculation.totals.importe)+' €',''],
            ].map(([label,value,detail])=><div key={label} className="min-w-0 bg-metro-surface/70 px-3 py-3"><p className="text-[11px] text-metro-muted">{label}</p><strong className="mt-1 block truncate text-lg text-metro-text">{value}</strong><span className="text-[10px] text-metro-muted">{detail}</span></div>)}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:w-52 xl:grid-cols-1">
            <button type="button" onClick={() => setShowOrderDetail(true)} className="flex items-center justify-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-extrabold text-white hover:bg-metro-dark"><Eye size={16}/> Ver pedido mensual</button>
<button type="button" onClick={onOpenMonthlyCalculation} className="flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"><Calculator size={16}/> Revisar cálculo</button><button type="button" onClick={onOpenMonthlyCalculation} className="flex items-center justify-center gap-2 rounded-lg border border-metro-border px-3 py-2 text-xs font-bold text-metro-text hover:border-metro-red"><Plus size={16}/> Registrar movimiento</button>
          </div>
        </div>

      </section>

      {showOrderDetail && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={event => { if(event.target===event.currentTarget) setShowOrderDetail(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Detalle del pedido mensual" className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel shadow-2xl">
          <div className="flex items-center justify-between border-b border-metro-border p-4"><div><h2 className="text-lg font-extrabold text-metro-text">Pedido mensual — {monthLabel}</h2><p className="text-xs text-metro-muted">{orderRegistered?'Datos del pedido registrado y sus movimientos posteriores':'Pedido no registrado: muestra únicamente la previsión actual'}</p></div><button type="button" onClick={() => setShowOrderDetail(false)} aria-label="Cerrar pedido" className="rounded-lg p-2 text-metro-text hover:bg-metro-surface"><X size={20}/></button></div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">{[['Cálculo actual',calculation.totals.ticketsFinales],['Pedido inicial',initialOrderedTickets],['Movimientos',orderRegistered?(orderedTickets??0)-(initialOrderedTickets??0):undefined],['Total solicitado',orderedTickets]].map(([label,value])=><div key={label} className="rounded-xl bg-metro-surface p-3"><div className="text-xs text-metro-muted">{label}</div><div className="text-xl font-extrabold text-metro-text">{typeof value==='number'?formatInteger(value):'—'}</div></div>)}</div>
          <div className="min-h-0 overflow-auto px-4 pb-4">
            {orderRegistered?<><h3 className="mb-2 text-sm font-bold text-metro-text">Detalle del pedido inicial</h3><table className="w-full text-left text-xs text-metro-text"><thead className="sticky top-0 bg-metro-surface"><tr><th className="p-2">Nº empleado</th><th className="p-2">Nombre y apellidos</th><th className="p-2 text-right">Tickets</th><th className="p-2 text-right">Importe</th></tr></thead><tbody>{orderRows.map((row,index)=><tr key={row.empleado+'-'+index} className="odd:bg-metro-surface/50"><td className="p-2">{row.empleado}</td><td className="p-2">{row.nombreApellidos}</td><td className="p-2 text-right">{formatInteger(row.tickets)}</td><td className="p-2 text-right">{typeof row.amount === 'number' ? `${formatMoney(row.amount)} €` : '—'}</td></tr>)}</tbody></table>{orderMovementRows.length>0&&<><h3 className="mb-2 mt-4 text-sm font-bold text-metro-text">Movimientos posteriores</h3>{orderMovementRows.map(item=><div key={item.id} className="flex flex-wrap justify-between gap-2 border-b border-metro-border p-2 text-xs text-metro-text"><span>{item.date} · {item.nombreApellidos||item.empleado||'General'} · {item.reason}</span><strong>{item.tickets>0?'+':''}{item.tickets} tickets</strong></div>)}</>}</>:<p className="rounded-lg border border-amber-500/30 p-3 text-sm text-amber-300">Todavía no existe un pedido realizado de este mes. Accede al cálculo para revisar la previsión y registrar el pedido cuando corresponda.</p>}
          </div><div className="flex justify-end gap-2 border-t border-metro-border p-3"><button type="button" onClick={() => setShowOrderDetail(false)} className="rounded-lg border border-metro-border px-3 py-2 text-xs text-metro-text">Cerrar</button><button type="button" onClick={() => {setShowOrderDetail(false);onOpenMonthlyCalculation();}} className="rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white">Abrir cómputo mensual</button></div>
        </section>
      </div>}
      <section className="rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-extrabold text-metro-text">Proceso mensual</h3><p className="text-[11px] text-metro-muted">Seguimiento de {monthLabel} · marca las revisiones para avanzar</p></div><span className="rounded-lg bg-metro-surface px-2 py-1 text-[11px] font-bold text-metro-secondary">{orderRegistered?'Pedido registrado':readyForOrder?'Listo para revisar pedido':'Preparación en curso'}</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
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
            reviewed={absencesReviewed}
            onReviewChange={(checked) => onReviewChange('absencesReviewed', checked)}
            title="Ausencias"
          />
          <ProcessStep
            detail={manutencionesReviewed ? `${manutencionCount} registros revisados` : manutencionCount > 0 ? `${manutencionCount} registros pendientes de revisión` : 'Pendiente de carga o revisión'}
            number={3}
            onClick={manutencionCount > 0 ? onOpenManutenciones : onImportManutenciones}
            state={manutencionesReviewed ? 'done' : absencesReviewed ? 'current' : 'pending'}
            reviewed={manutencionesReviewed}
            onReviewChange={(checked) => onReviewChange('manutencionesReviewed', checked)}
            title="Manutenciones"
          />
          <ProcessStep
            detail={manualDebtsReviewed ? 'Control revisado' : manualDebtCount > 0 ? `${manualDebtCount} ajustes activos` : 'Pendiente de revisión'}
            number={4}
            onClick={onOpenManualDebt}
            state={manualDebtsReviewed ? 'done' : monthlyInputsReviewed ? 'current' : 'pending'}
            reviewed={manualDebtsReviewed}
            onReviewChange={(checked) => onReviewChange('manualDebtsReviewed', checked)}
            title="Deudas y ajustes"
          />
          <ProcessStep
            detail={orderRegistered ? `${formatInteger(orderedTickets)} tickets solicitados` : `${formatInteger(calculation.totals.ticketsFinales)} tickets · ${formatMoney(calculation.totals.importe)} €`}
            number={5}
            onClick={onOpenMonthlyCalculation}
            state={orderRegistered ? 'done' : readyForOrder ? 'current' : 'pending'}
            title={orderRegistered ? 'Pedido realizado' : 'Revisar pedido'}
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

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-metro-border bg-metro-panel p-3">
        <div className="flex items-center gap-2"><NextIcon className="h-5 w-5 text-red-300"/><div><p className="text-[10px] font-bold uppercase text-metro-muted">{nextAction.eyebrow}</p><p className="text-sm font-extrabold text-metro-text">{nextAction.title}</p><p className="max-w-3xl text-[11px] text-metro-secondary">{nextAction.detail}</p></div></div>
        <button type="button" onClick={nextAction.onClick} className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white">{nextAction.button}<ArrowRight size={15}/></button>
      </section>

      <div className="grid gap-3 xl:grid-cols-[3fr_2fr]">
        <section className="rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
          <h3 className="mb-2 text-sm font-extrabold text-metro-text">Accesos rápidos</h3>
          <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
            <AdvancedAction icon={CalendarDays} title="Calendarios" detail="Configurar días" onClick={onOpenCalendars}/>
            <AdvancedAction icon={Users} title="Personas" detail="Derecho al ticket" onClick={onOpenPeople}/>
            <AdvancedAction icon={FileSpreadsheet} title="Ausencias" detail="Revisar registros" onClick={onOpenAbsences}/>
            <AdvancedAction icon={Utensils} title="Manutenciones" detail="Revisar gastos" onClick={onOpenManutenciones}/>
            <AdvancedAction icon={ReceiptText} title="Deudas y ajustes" detail="Regularizaciones" onClick={onOpenManualDebt}/>
            <AdvancedAction icon={BarChart3} title="Balance anual" detail="Detalle por mes" onClick={onOpenAnnualBalance}/>
            <AdvancedAction icon={Euro} title="Precio del ticket" detail="Histórico de precios" onClick={onOpenPrice}/>
            <AdvancedAction icon={Settings} title="Reglas de cálculo" detail="Parámetros" onClick={onOpenRules}/>
          </div>
        </section>
        <section className="rounded-xl border border-metro-border bg-metro-panel p-3 shadow-card">
          <h3 className="mb-2 text-sm font-extrabold text-metro-text">Avisos y control</h3>
          <div className="space-y-2 text-xs">
            {!absencesReviewed&&<button type="button" onClick={onOpenAbsences} className="block w-full rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-left text-amber-300">Ausencias pendientes de revisión</button>}
            {!manutencionesReviewed&&<button type="button" onClick={onOpenManutenciones} className="block w-full rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-left text-amber-300">Manutenciones pendientes de revisión</button>}
            {!manualDebtsReviewed&&<button type="button" onClick={onOpenManualDebt} className="block w-full rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-left text-amber-300">Deudas y ajustes sin revisar</button>}
            {readyForOrder&&<p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2 text-emerald-300">Controles revisados. {orderRegistered?'Pedido registrado.':'Pedido listo para validación.'}</p>}
          </div>
        </section>
      </div>
      <button type="button" onClick={onOpenAnnualBalance} className="flex w-full items-center justify-between rounded-xl border border-metro-border bg-metro-panel p-3 text-left text-metro-text hover:border-metro-red/40"><span className="flex items-center gap-2"><BarChart3 size={20} className="text-red-300"/><span><strong className="block text-sm">Balance anual {year}</strong><span className="text-[11px] text-metro-muted">Evolución mensual, acumulados y detalle por persona</span></span></span><ArrowRight size={17}/></button>

      <details className="group rounded-2xl border border-metro-border bg-metro-panel shadow-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-metro-surface text-metro-secondary"><Settings className="h-4 w-4" /></span>
            <div>
              <p className="text-[13px] font-extrabold text-metro-text">Importaciones y herramientas avanzadas</p>
              <p className="mt-0.5 text-xs text-metro-muted">Calendarios, personas, precio, reglas y accesos de mantenimiento.</p>
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
