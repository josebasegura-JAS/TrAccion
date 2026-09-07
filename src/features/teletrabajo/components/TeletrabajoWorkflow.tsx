import { useState } from 'react';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  History,
  ListChecks,
  Settings,
  ShieldCheck,
  TrafficCone,
  UserPlus,
  Users,
} from 'lucide-react';

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
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasPeriod = Boolean(periodo);
  const hasRequests = total > 0;
  const validationPending = pendientes + analizadas;
  const validationReady = hasRequests && validationPending === 0;
  const coverageReady = validationReady && bloqueantes === 0;
  const resolvedCount = aprobadas + denegadas + desistidas;

  const nextAction = !hasPeriod
    ? {
        eyebrow: 'Antes de empezar',
        title: 'Configura el periodo de teletrabajo',
        detail: 'Abre el periodo con el que vas a trabajar y revisa la configuración base antes de registrar solicitudes.',
        button: 'Gestionar periodos',
        icon: CalendarDays,
        onClick: onOpenPeriodos,
        ready: false,
      }
    : !hasRequests
      ? {
          eyebrow: 'Siguiente paso recomendado',
          title: 'Registrar las solicitudes del periodo',
          detail: `Todavía no hay solicitudes en ${periodo}. Puedes dar una de alta o entrar en la vista de solicitudes para importar y registrar las recibidas.`,
          button: 'Ir a solicitudes',
          icon: UserPlus,
          onClick: onOpenSolicitudes,
          ready: false,
        }
      : validationPending > 0
        ? {
            eyebrow: 'Siguiente paso recomendado',
            title: 'Revisar y resolver solicitudes',
            detail: `${validationPending} solicitud${validationPending === 1 ? '' : 'es'} requieren seguimiento: ${pendientes} pendiente${pendientes === 1 ? '' : 's'} y ${analizadas} analizada${analizadas === 1 ? '' : 's'}.`,
            button: 'Abrir panel de validación',
            icon: ListChecks,
            onClick: onOpenValidacion,
            ready: false,
          }
        : bloqueantes > 0 || incidencias > 0
          ? {
              eyebrow: bloqueantes > 0 ? 'Revisión necesaria antes de cerrar' : 'Comprobación recomendada',
              title: bloqueantes > 0 ? 'Resolver incidencias de cobertura' : 'Revisar la cobertura del periodo',
              detail: bloqueantes > 0
                ? `Hay ${bloqueantes} incidencia${bloqueantes === 1 ? '' : 's'} bloqueante${bloqueantes === 1 ? '' : 's'} en la cobertura. Revísalas antes de preparar la salida a Dirección.`
                : `Las solicitudes están resueltas. Hay ${incidencias} incidencia${incidencias === 1 ? '' : 's'} de cobertura para comprobar antes de cerrar el periodo.`,
              button: 'Revisar cobertura',
              icon: TrafficCone,
              onClick: onOpenIncidencias,
              ready: false,
            }
          : {
              eyebrow: 'Periodo preparado',
              title: 'Preparar la información para Dirección',
              detail: `${resolvedCount} solicitud${resolvedCount === 1 ? '' : 'es'} resuelta${resolvedCount === 1 ? '' : 's'} y sin incidencias bloqueantes de cobertura. Puedes revisar el detalle o generar la exportación.`,
              button: 'Exportar Dirección',
              icon: Download,
              onClick: onExportDireccion,
              ready: true,
            };

  const NextIcon = nextAction.icon;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-base font-extrabold text-metro-text">Proceso de Teletrabajo</p>
            <p className="mt-1 text-xs text-metro-muted">Sigue el periodo de principio a fin. La aplicación te indicará qué requiere atención.</p>
          </div>
          <select
            aria-label="Periodo activo"
            className="h-9 min-w-[190px] rounded-lg border border-metro-border bg-metro-surface px-3 text-[13px] font-semibold text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => onPeriodoChange(event.target.value)}
            value={periodo}
          >
            {periodos.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
          <ProcessStep
            detail={hasPeriod ? periodo : 'Sin periodo activo'}
            number={1}
            onClick={onOpenPeriodos}
            state={hasPeriod ? 'done' : 'current'}
            title="Periodo"
          />
          <ProcessStep
            detail={hasRequests ? `${total} registradas · ${nuevas} nuevas` : 'Pendiente de registro'}
            number={2}
            onClick={onOpenSolicitudes}
            state={hasRequests ? 'done' : hasPeriod ? 'current' : 'pending'}
            title="Solicitudes"
          />
          <ProcessStep
            detail={validationReady ? `${resolvedCount} resueltas` : `${validationPending} requieren seguimiento`}
            number={3}
            onClick={onOpenValidacion}
            state={validationReady ? 'done' : hasRequests ? 'current' : 'pending'}
            title="Validación"
          />
          <ProcessStep
            detail={coverageReady ? 'Sin bloqueantes' : bloqueantes > 0 ? `${bloqueantes} bloqueantes` : `${incidencias} incidencias`}
            number={4}
            onClick={onOpenIncidencias}
            state={coverageReady ? 'done' : validationReady ? 'current' : 'pending'}
            title="Cobertura"
          />
          <ProcessStep
            detail={coverageReady ? 'Preparado para exportar' : 'Pendiente de cierre'}
            number={5}
            onClick={onExportDireccion}
            state={coverageReady ? 'current' : 'pending'}
            title="Dirección"
          />
        </div>
      </section>

      <section
        className={cx(
          'rounded-xl border p-4 shadow-card',
          nextAction.ready
            ? 'border-emerald-400/30 bg-emerald-500/[0.055]'
            : 'border-metro-red/45 bg-gradient-to-br from-metro-panel via-metro-panel to-red-950/10',
        )}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={cx(
                'grid h-11 w-11 shrink-0 place-items-center rounded-xl',
                nextAction.ready ? 'bg-emerald-500/15 text-emerald-300' : 'bg-metro-red/12 text-red-300',
              )}
            >
              {nextAction.ready ? <CheckCircle2 className="h-5 w-5" /> : <NextIcon className="h-5 w-5" />}
            </span>
            <div className="min-w-0">
              <p className={cx('text-[11px] font-bold uppercase tracking-[0.08em]', nextAction.ready ? 'text-emerald-300' : 'text-red-300')}>{nextAction.eyebrow}</p>
              <h2 className="mt-1 text-lg font-extrabold leading-6 text-metro-text">{nextAction.title}</h2>
              <p className="mt-1 max-w-3xl text-[12px] leading-5 text-metro-secondary">{nextAction.detail}</p>
            </div>
          </div>
          <button
            className={cx(
              'inline-flex min-h-[42px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-extrabold transition',
              nextAction.ready ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-metro-red text-white hover:bg-metro-dark',
            )}
            onClick={nextAction.onClick}
            type="button"
          >
            {nextAction.button} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-metro-border bg-metro-panel p-4 shadow-card">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-extrabold text-metro-text">Resumen del periodo</p>
            <p className="mt-1 text-[11px] text-metro-muted">La información esencial para saber dónde está el proceso.</p>
          </div>
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <button className="rounded-lg border border-metro-border bg-metro-surface/55 px-3 py-2 text-left hover:bg-metro-raised" onClick={onOpenSolicitudes} type="button">
              <span className="block text-lg font-extrabold text-metro-text">{total}</span>
              <span className="text-[11px] font-semibold text-metro-muted">Solicitudes</span>
            </button>
            <button className="rounded-lg border border-amber-400/20 bg-amber-500/[0.055] px-3 py-2 text-left hover:bg-metro-raised" onClick={onOpenPendientes} type="button">
              <span className="block text-lg font-extrabold text-metro-text">{validationPending}</span>
              <span className="text-[11px] font-semibold text-amber-300">Por resolver</span>
            </button>
            <button className="rounded-lg border border-emerald-400/20 bg-emerald-500/[0.055] px-3 py-2 text-left hover:bg-metro-raised" onClick={onOpenAprobadas} type="button">
              <span className="block text-lg font-extrabold text-metro-text">{aprobadas}</span>
              <span className="text-[11px] font-semibold text-emerald-300">Aprobadas</span>
            </button>
            <button className="rounded-lg border border-red-400/20 bg-red-500/[0.055] px-3 py-2 text-left hover:bg-metro-raised" onClick={onOpenDenegadas} type="button">
              <span className="block text-lg font-extrabold text-metro-text">{denegadas + desistidas}</span>
              <span className="text-[11px] font-semibold text-red-300">Denegadas / desistidas</span>
            </button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-metro-border bg-metro-panel shadow-card">
        <button
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-metro-raised/55"
          onClick={() => setShowAdvanced((current) => !current)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-metro-red/10 text-red-300"><Settings className="h-4 w-4" /></span>
            <span>
              <span className="block text-sm font-extrabold text-metro-text">Configuración y herramientas avanzadas</span>
              <span className="mt-0.5 block text-[11px] text-metro-muted">Periodos, puestos, grupos de cobertura, histórico y accesos de administración.</span>
            </span>
          </span>
          <ChevronDown className={cx('h-4 w-4 shrink-0 text-metro-muted transition-transform', showAdvanced && 'rotate-180')} />
        </button>

        {showAdvanced ? (
          <div className="border-t border-metro-border p-4">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <AdvancedAction icon={CalendarDays} title="Gestionar periodos" detail="Abrir, copiar o cambiar la configuración del periodo." onClick={onOpenPeriodos} />
              <AdvancedAction icon={BriefcaseBusiness} title={`Puestos teletrabajables · ${puestosCount}`} detail="Mantener los puestos que pueden acceder a teletrabajo." onClick={onOpenPuestos} />
              <AdvancedAction icon={Users} title={`Grupos de cobertura · ${gruposCount}`} detail="Configurar y revisar los grupos utilizados para cobertura." onClick={onOpenGrupos} />
              <AdvancedAction icon={History} title="Histórico" detail="Consultar periodos anteriores y realizar importaciones históricas." onClick={onOpenHistorico} />
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <AdvancedAction icon={UserPlus} title="Nueva solicitud" detail="Dar de alta manualmente una solicitud en el periodo activo." onClick={onCreateSolicitud} />
              <AdvancedAction icon={FileCheck2} title="Todas las solicitudes" detail="Abrir la vista operativa completa, con filtros y detalle." onClick={onOpenSolicitudes} />
              <AdvancedAction icon={ShieldCheck} title={`Incidencias · ${incidencias}`} detail="Consultar conflictos y controles de cobertura." onClick={onOpenIncidencias} />
              <AdvancedAction icon={Download} title="Exportar Dirección" detail="Generar la salida de información del periodo activo." onClick={onExportDireccion} />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
