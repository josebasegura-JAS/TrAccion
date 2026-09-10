import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, ChevronRight, Trash2 } from 'lucide-react';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Select } from '../../../components/ui/Field';
import { Notice } from '../../../components/ui/Notice';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useTicketRestauranteStore } from '../../ticket-restaurante/store/useTicketRestauranteStore';
import {
  BUDGET_ACTUAL_BLOCKS,
  BUDGET_MONTHS,
  buildAutomaticTicketPlan,
  buildBudgetActualDashboardData,
  calculateBudgetManualItemYear,
  calculateBudgetScenarioYear,
  type BudgetActualBlock,
  type BudgetManualItem,
  type BudgetScenario,
} from '../domain/presupuestos';
import {
  usePresupuestosStore,
  type BudgetActualDraft,
  type BudgetManualItemDraft,
  type BudgetScenarioDraft,
} from '../store/usePresupuestosStore';
import {
  MONTH_NAMES,
  PRESUPUESTOS_HELP_SECTIONS,
  emptyActualDraft,
  emptyManualDraft,
  emptyScenarioDraft,
  euro,
  percent,
} from './presupuestosPage.helpers';

type Stage = 'scenario' | 'simulate' | 'compare' | 'execute';

type ManualEdit = Record<string, { concept: string; category: string; annualAmount: number }>;

type StepProps = {
  number: number;
  title: string;
  detail: string;
  active: boolean;
  done: boolean;
  onClick: () => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function WorkflowStep({ number, title, detail, active, done, onClick }: StepProps) {
  return (
    <button
      className={cx(
        'flex min-h-[72px] min-w-0 flex-1 items-start gap-3 rounded-xl border px-3 py-3 text-left transition',
        active
          ? 'border-metro-red bg-metro-red/[0.07] shadow-sm'
          : done
            ? 'border-emerald-500/25 bg-emerald-500/[0.045] hover:border-emerald-500/45'
            : 'border-metro-border bg-metro-surface/55 hover:border-metro-red/40 hover:bg-metro-raised',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-extrabold',
          done
            ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
            : active
              ? 'border-metro-red bg-metro-red text-white'
              : 'border-metro-border bg-metro-panel text-metro-muted',
        )}
      >
        {done ? <Check size={15} /> : number}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[13px] font-extrabold leading-4 text-metro-text">{title}</span>
        <span className="mt-1 block text-[11px] leading-4 text-metro-muted">{detail}</span>
      </span>
    </button>
  );
}

function Panel({
  children,
  className,
  title,
  subtitle,
}: {
  children: ReactNode;
  className?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <section className={cx('rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm', className)}>
      <div className="mb-3">
        <h3 className="text-sm font-extrabold text-metro-text">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11px] text-metro-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-metro-border bg-metro-surface/65 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-metro-muted">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-metro-text">{value}</p>
      {detail ? <p className="text-[10px] text-metro-muted">{detail}</p> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <FieldLabel className="space-y-1 text-xs">
      {label}
      {children}
    </FieldLabel>
  );
}

export function PresupuestosPage() {
  const { calendars, people, load: loadTicketData } = useTicketRestauranteStore();
  const {
    activeScenarioId,
    actuals,
    duplicateScenario,
    finalizeScenarioBudget,
    load,
    manualItems,
    removeActual,
    removeManualItem,
    removeScenario,
    scenarios,
    selectScenarioForExecution,
    setActiveScenario,
    ticketGroups,
    upsertActual,
    upsertManualItem,
    upsertScenario,
  } = usePresupuestosStore();

  const currentYear = new Date().getFullYear();
  const [stage, setStage] = useState<Stage>('scenario');
  const [scenarioDraft, setScenarioDraft] = useState<BudgetScenarioDraft>(emptyScenarioDraft(currentYear));
  const [manualDraft, setManualDraft] = useState<BudgetManualItemDraft>(emptyManualDraft(''));
  const [manualEdits, setManualEdits] = useState<ManualEdit>({});
  const [ticketAbsenceA, setTicketAbsenceA] = useState(3);
  const [ticketAbsenceB, setTicketAbsenceB] = useState(6);
  const [ticketExtras, setTicketExtras] = useState<Record<string, number>>({});
  const [comparisonYear, setComparisonYear] = useState(currentYear);
  const [finalAmounts, setFinalAmounts] = useState<Record<string, number>>({});
  const [actualDraft, setActualDraft] = useState<BudgetActualDraft>(emptyActualDraft(currentYear));
  const [cutoffMonth, setCutoffMonth] = useState(new Date().getMonth() + 1);
  const [message, setMessage] = useState('');

  useEffect(() => {
    load();
    loadTicketData();
  }, [load, loadTicketData]);

  const visibleScenarios = useMemo(() => scenarios.filter((scenario) => !scenario.deletedAt), [scenarios]);
  const yearScenarios = useMemo(
    () => visibleScenarios.filter((scenario) => scenario.year === comparisonYear),
    [comparisonYear, visibleScenarios],
  );
  const activeScenario =
    visibleScenarios.find((scenario) => scenario.id === activeScenarioId) ?? visibleScenarios[0] ?? null;
  const activeScenarioIdResolved = activeScenario?.id ?? '';
  const selectedScenario =
    yearScenarios.find((scenario) => scenario.selectedForExecution) ??
    visibleScenarios.find((scenario) => scenario.selectedForExecution && scenario.year === activeScenario?.year) ??
    null;

  const activeManualItems = useMemo(
    () =>
      manualItems
        .filter((item) => !item.deletedAt && item.scenarioId === activeScenarioIdResolved)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [activeScenarioIdResolved, manualItems],
  );

  useEffect(() => {
    if (!activeScenario) return;
    setComparisonYear(activeScenario.year);
    setTicketAbsenceA((activeScenario.ticketAbsenceRateA ?? 0.03) * 100);
    setTicketAbsenceB((activeScenario.ticketAbsenceRateB ?? 0.06) * 100);
    setTicketExtras(activeScenario.ticketExtraPeopleByCalendar ?? {});
    setManualDraft(emptyManualDraft(activeScenario.id));
  }, [activeScenario]);

  useEffect(() => {
    const next: ManualEdit = {};
    activeManualItems.forEach((item) => {
      next[item.id] = {
        concept: item.concept,
        category: item.category,
        annualAmount: calculateBudgetManualItemYear(item),
      };
    });
    setManualEdits(next);
  }, [activeManualItems]);

  const liveScenario = useMemo<BudgetScenario | null>(() => {
    if (!activeScenario) return null;
    return {
      ...activeScenario,
      ticketPlanningMode: 'automatic',
      ticketAbsenceRateA: Math.max(0, Math.min(ticketAbsenceA, 100)) / 100,
      ticketAbsenceRateB: Math.max(0, Math.min(ticketAbsenceB, 100)) / 100,
      ticketExtraPeopleByCalendar: ticketExtras,
    };
  }, [activeScenario, ticketAbsenceA, ticketAbsenceB, ticketExtras]);

  const liveManualItems = useMemo<BudgetManualItem[]>(
    () =>
      manualItems.map((item) => {
        const edit = manualEdits[item.id];
        if (!edit || item.scenarioId !== activeScenarioIdResolved || item.deletedAt) return item;
        return { ...item, concept: edit.concept, category: edit.category, monthlyAmount: 0, annualAmount: edit.annualAmount };
      }),
    [activeScenarioIdResolved, manualEdits, manualItems],
  );

  const liveTotal = useMemo(
    () =>
      liveScenario
        ? calculateBudgetScenarioYear(liveScenario, liveManualItems, ticketGroups, liveScenario.year, calendars, people)
        : null,
    [calendars, liveManualItems, liveScenario, people, ticketGroups],
  );

  const liveTicketPlan = useMemo(
    () =>
      liveScenario ? buildAutomaticTicketPlan(liveScenario, liveScenario.year, calendars, people) : null,
    [calendars, liveScenario, people],
  );

  const selectedManualItems = useMemo(
    () =>
      selectedScenario
        ? manualItems.filter((item) => !item.deletedAt && item.scenarioId === selectedScenario.id)
        : [],
    [manualItems, selectedScenario],
  );

  useEffect(() => {
    if (!selectedScenario) {
      setFinalAmounts({});
      return;
    }
    const calculated = calculateBudgetScenarioYear(
      selectedScenario,
      manualItems,
      ticketGroups,
      selectedScenario.year,
      calendars,
      people,
    );
    const next: Record<string, number> = {
      ticket: selectedScenario.finalBudgetAmounts?.ticket ?? calculated.ticketTotal,
    };
    selectedManualItems.forEach((item) => {
      next[`manual:${item.id}`] =
        selectedScenario.finalBudgetAmounts?.[`manual:${item.id}`] ?? calculateBudgetManualItemYear(item);
    });
    setFinalAmounts(next);
    setActualDraft(emptyActualDraft(selectedScenario.year));
  }, [calendars, manualItems, people, selectedManualItems, selectedScenario, ticketGroups]);

  const finalPreviewTotal = useMemo(
    () => Object.values(finalAmounts).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    [finalAmounts],
  );

  const executionDashboard = useMemo(() => {
    if (!selectedScenario) return null;
    return buildBudgetActualDashboardData(
      selectedScenario,
      manualItems,
      ticketGroups,
      actuals,
      selectedScenario.year,
      cutoffMonth,
      calendars,
      people,
    );
  }, [actuals, calendars, cutoffMonth, manualItems, people, selectedScenario, ticketGroups]);

  const saveScenario = () => {
    const result = upsertScenario(scenarioDraft);
    if (!result.valid || !result.id) {
      setMessage(result.errors.join(' '));
      return;
    }
    setActiveScenario(result.id);
    setScenarioDraft(emptyScenarioDraft(scenarioDraft.year));
    setMessage('Escenario creado. Ya puedes simularlo.');
    setStage('simulate');
  };

  const saveSimulation = () => {
    if (!activeScenario) return;
    const scenarioResult = upsertScenario(
      {
        name: activeScenario.name,
        year: activeScenario.year,
        ticketAmount: activeScenario.ticketAmount,
        ticketPlanningMode: 'automatic',
        ticketAbsenceRateA: Math.max(0, Math.min(ticketAbsenceA, 100)) / 100,
        ticketAbsenceRateB: Math.max(0, Math.min(ticketAbsenceB, 100)) / 100,
        ticketExtraPeopleByCalendar: ticketExtras,
        notes: activeScenario.notes,
      },
      activeScenario.id,
    );
    if (!scenarioResult.valid) {
      setMessage(scenarioResult.errors.join(' '));
      return;
    }
    for (const item of activeManualItems) {
      const edit = manualEdits[item.id];
      if (!edit) continue;
      upsertManualItem(
        {
          scenarioId: item.scenarioId,
          concept: edit.concept,
          category: edit.category,
          monthlyAmount: 0,
          annualAmount: edit.annualAmount,
          notes: item.notes,
        },
        item.id,
      );
    }
    setMessage('Simulación guardada. Los importes se recalculan automáticamente mientras editas.');
  };

  const addManualItem = () => {
    if (!activeScenario) return;
    const result = upsertManualItem({ ...manualDraft, scenarioId: activeScenario.id });
    if (!result.valid) {
      setMessage(result.errors.join(' '));
      return;
    }
    setManualDraft(emptyManualDraft(activeScenario.id));
    setMessage('Partida añadida.');
  };

  const chooseScenario = (scenario: BudgetScenario) => {
    selectScenarioForExecution(scenario.id);
    setActiveScenario(scenario.id);
    setMessage(`${scenario.name} seleccionado como escenario a ejecutar para ${scenario.year}.`);
  };

  const confirmAndRemoveScenario = (scenario: BudgetScenario) => {
    const isFinalized = Boolean(scenario.finalizedAt);
    const firstMessage = isFinalized
      ? `Vas a eliminar el presupuesto definitivo "${scenario.name}" de ${scenario.year}. También se eliminarán su escenario y sus partidas asociadas. ¿Quieres continuar?`
      : `¿Eliminar el escenario "${scenario.name}" de ${scenario.year}? También se eliminarán sus partidas asociadas.`;

    if (!window.confirm(firstMessage)) return;

    if (isFinalized) {
      const secondConfirmed = window.confirm(
        `SEGUNDA CONFIRMACIÓN: el presupuesto "${scenario.name}" está cerrado como definitivo. Esta acción lo eliminará del flujo presupuestario. ¿Confirmas definitivamente?`,
      );
      if (!secondConfirmed) return;
    }

    removeScenario(scenario.id);
    setMessage(
      isFinalized
        ? `Presupuesto definitivo "${scenario.name}" eliminado.`
        : `Escenario "${scenario.name}" eliminado.`,
    );

    if (activeScenarioId === scenario.id) setStage('scenario');
  };

  const finalizeBudget = () => {
    if (!selectedScenario) return;
    finalizeScenarioBudget(selectedScenario.id, finalAmounts);
    setMessage('Presupuesto definitivo guardado. El seguimiento contra real utilizará estos importes.');
    setStage('execute');
  };

  const saveActual = () => {
    if (!selectedScenario) return;
    const result = upsertActual({ ...actualDraft, year: selectedScenario.year });
    if (!result.valid) {
      setMessage(result.errors.join(' '));
      return;
    }
    setActualDraft(emptyActualDraft(selectedScenario.year));
    setMessage('Importe ejecutado añadido.');
  };

  const scenarioDone = visibleScenarios.length > 0;
  const simulationDone = Boolean(activeScenario && (activeManualItems.length > 0 || (liveTicketPlan?.totalPeople ?? 0) > 0));
  const comparisonDone = Boolean(selectedScenario);
  const executionDone = Boolean(selectedScenario?.finalizedAt);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Presupuestos"
        status={<InlineSaveFeedback />}
        helpSections={PRESUPUESTOS_HELP_SECTIONS}
        helpSubtitle="Flujo anual: crear, simular, elegir, cerrar y controlar."
      />

      {message ? <Notice>{message}</Notice> : null}

      <div className="grid gap-2 lg:grid-cols-4">
        <WorkflowStep number={1} title="Crear escenario" detail="Año, nombre y precio de ticket." active={stage === 'scenario'} done={scenarioDone} onClick={() => setStage('scenario')} />
        <WorkflowStep number={2} title="Simular" detail="Ticket + partidas en una sola pantalla." active={stage === 'simulate'} done={simulationDone} onClick={() => setStage('simulate')} />
        <WorkflowStep number={3} title="Comparar y elegir" detail="Compara alternativas del mismo año." active={stage === 'compare'} done={comparisonDone} onClick={() => setStage('compare')} />
        <WorkflowStep number={4} title="Definitivo y ejecución" detail="Ajusta Dirección y controla el real." active={stage === 'execute'} done={executionDone} onClick={() => setStage('execute')} />
      </div>

      {stage === 'scenario' && (
        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
          <Panel title="Nuevo escenario" subtitle="Crea una alternativa presupuestaria para un ejercicio.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre del escenario">
                <Input value={scenarioDraft.name} onChange={(event) => setScenarioDraft({ ...scenarioDraft, name: event.target.value })} placeholder="Ej. Base 2027" />
              </Field>
              <Field label="Ejercicio">
                <Input type="number" value={scenarioDraft.year} onChange={(event) => setScenarioDraft({ ...scenarioDraft, year: Number(event.target.value) })} />
              </Field>
              <Field label="Precio previsto del ticket (€)">
                <Input type="number" min="0" step="0.01" value={scenarioDraft.ticketAmount} onChange={(event) => setScenarioDraft({ ...scenarioDraft, ticketAmount: Number(event.target.value) })} />
              </Field>
              <Field label="Notas">
                <Input value={scenarioDraft.notes} onChange={(event) => setScenarioDraft({ ...scenarioDraft, notes: event.target.value })} placeholder="Hipótesis principal" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <ActionButton iconOnly={false} onClick={saveScenario} variant="save">Crear y simular</ActionButton>
            </div>
          </Panel>

          <Panel title="Escenarios existentes" subtitle="Abre, duplica o elimina alternativas ya creadas.">
            <div className="space-y-2">
              {visibleScenarios.length === 0 ? (
                <p className="rounded-xl border border-dashed border-metro-border p-5 text-center text-sm text-metro-muted">Todavía no hay escenarios.</p>
              ) : (
                visibleScenarios
                  .slice()
                  .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))
                  .map((scenario) => {
                    const total = calculateBudgetScenarioYear(scenario, manualItems, ticketGroups, scenario.year, calendars, people);
                    return (
                      <div key={scenario.id} className="flex items-center gap-3 rounded-xl border border-metro-border bg-metro-surface/55 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-metro-text">{scenario.name}</p>
                            <span className="rounded-full bg-metro-raised px-2 py-0.5 text-[10px] font-bold text-metro-muted">{scenario.year}</span>
                            {scenario.selectedForExecution ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">Seleccionado</span> : null}
                            {scenario.finalizedAt ? <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-bold text-blue-300">Definitivo</span> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-metro-muted">{euro(total.total)} · ticket {euro(scenario.ticketAmount)}</p>
                        </div>
                        <ActionButton size="sm" iconOnly={false} variant="secondary" onClick={() => { setActiveScenario(scenario.id); setStage('simulate'); }}>Abrir</ActionButton>
                        <ActionButton size="sm" variant="duplicate" onClick={() => duplicateScenario(scenario.id)} title="Duplicar escenario" />
                        <ActionButton size="sm" variant="delete" onClick={() => confirmAndRemoveScenario(scenario)} title={scenario.finalizedAt ? 'Eliminar presupuesto definitivo' : 'Eliminar escenario'} />
                      </div>
                    );
                  })
              )}
            </div>
          </Panel>
        </div>
      )}

      {stage === 'simulate' && (
        !activeScenario || !liveScenario || !liveTotal || !liveTicketPlan ? (
          <Notice>Primero crea o abre un escenario.</Notice>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-metro-border bg-metro-panel px-4 py-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-metro-muted">Simulando</p>
                <p className="text-lg font-extrabold text-metro-text">{activeScenario.name} · {activeScenario.year}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Partidas" value={euro(liveTotal.manualTotal)} />
                <Metric label="Ticket" value={euro(liveTotal.ticketTotal)} detail={`Absentismo ${ticketAbsenceA}%`} />
                <Metric label="Total escenario" value={euro(liveTotal.total)} />
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Ticket Restaurante" subtitle="La base viene de Ticket Restaurante. Cualquier cambio aquí recalcula el escenario al momento.">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Metric label="Personas fijas" value={String(liveTicketPlan.basePeople)} />
                  <Metric label="Adicionales" value={`+${liveTicketPlan.additionalPeople}`} />
                  <Metric label="Total personas" value={String(liveTicketPlan.totalPeople)} />
                  <Metric label="Precio ticket" value={euro(activeScenario.ticketAmount)} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Absentismo A (%) · cálculo principal">
                    <Input type="number" min="0" max="100" step="0.1" value={ticketAbsenceA} onChange={(event) => setTicketAbsenceA(Number(event.target.value))} />
                  </Field>
                  <Field label="Absentismo B (%) · sensibilidad">
                    <Input type="number" min="0" max="100" step="0.1" value={ticketAbsenceB} onChange={(event) => setTicketAbsenceB(Number(event.target.value))} />
                  </Field>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-xl border border-metro-border bg-metro-surface/55 p-3">
                    <p className="text-xs font-bold text-metro-text">Escenario A · {ticketAbsenceA}%</p>
                    <p className="mt-1 text-lg font-extrabold text-metro-text">{euro(liveTicketPlan.annualAmountA)}</p>
                    <p className="text-[11px] text-metro-muted">{liveTicketPlan.annualTicketsA.toLocaleString('es-ES')} tickets previstos</p>
                  </div>
                  <div className="rounded-xl border border-metro-border bg-metro-surface/55 p-3">
                    <p className="text-xs font-bold text-metro-text">Escenario B · {ticketAbsenceB}%</p>
                    <p className="mt-1 text-lg font-extrabold text-metro-text">{euro(liveTicketPlan.annualAmountB)}</p>
                    <p className="text-[11px] text-metro-muted">{liveTicketPlan.annualTicketsB.toLocaleString('es-ES')} tickets previstos</p>
                  </div>
                </div>
                <div className="mt-3 max-h-[240px] overflow-y-auto rounded-xl border border-metro-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-metro-raised text-metro-muted">
                      <tr><th className="px-3 py-2 text-left">Calendario</th><th className="px-2 py-2 text-right">Fijas</th><th className="px-2 py-2 text-right">Añadir</th><th className="px-3 py-2 text-right">Total</th></tr>
                    </thead>
                    <tbody>
                      {liveTicketPlan.rows.map((row) => (
                        <tr key={row.calendarId} className="border-t border-metro-border/70">
                          <td className="px-3 py-2 font-semibold text-metro-text">{row.calendarName}</td>
                          <td className="px-2 py-2 text-right text-metro-muted">{row.basePeople}</td>
                          <td className="px-2 py-1.5 text-right"><Input className="ml-auto h-8 w-20 text-right" type="number" min="0" step="1" value={ticketExtras[row.calendarId] ?? 0} onChange={(event) => setTicketExtras({ ...ticketExtras, [row.calendarId]: Math.max(0, Number(event.target.value)) })} /></td>
                          <td className="px-3 py-2 text-right font-bold text-metro-text">{row.totalPeople}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Partidas manuales" subtitle="Edita directamente concepto e importe anual. El total superior cambia sin tener que pulsar Calcular.">
                <div className="max-h-[335px] overflow-y-auto rounded-xl border border-metro-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-metro-raised text-metro-muted">
                      <tr><th className="px-2 py-2 text-left">Partida</th><th className="px-2 py-2 text-left">Categoría</th><th className="px-2 py-2 text-right">Anual</th><th className="w-10" /></tr>
                    </thead>
                    <tbody>
                      {activeManualItems.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-metro-muted">Añade la primera partida debajo.</td></tr> : null}
                      {activeManualItems.map((item) => {
                        const edit = manualEdits[item.id] ?? { concept: item.concept, category: item.category, annualAmount: calculateBudgetManualItemYear(item) };
                        return (
                          <tr key={item.id} className="border-t border-metro-border/70">
                            <td className="p-1.5"><Input className="h-8" value={edit.concept} onChange={(event) => setManualEdits({ ...manualEdits, [item.id]: { ...edit, concept: event.target.value } })} /></td>
                            <td className="p-1.5"><Input className="h-8" value={edit.category} onChange={(event) => setManualEdits({ ...manualEdits, [item.id]: { ...edit, category: event.target.value } })} /></td>
                            <td className="p-1.5"><Input className="h-8 text-right" type="number" min="0" step="0.01" value={edit.annualAmount} onChange={(event) => setManualEdits({ ...manualEdits, [item.id]: { ...edit, annualAmount: Number(event.target.value) } })} /></td>
                            <td className="p-1.5"><button className="grid h-8 w-8 place-items-center rounded-lg text-red-300 transition hover:bg-red-500/10" onClick={() => removeManualItem(item.id)} title="Eliminar partida" type="button"><Trash2 size={14} /></button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_0.8fr_0.7fr_auto]">
                  <Input placeholder="Nueva partida" value={manualDraft.concept} onChange={(event) => setManualDraft({ ...manualDraft, concept: event.target.value })} />
                  <Input placeholder="Categoría" value={manualDraft.category} onChange={(event) => setManualDraft({ ...manualDraft, category: event.target.value })} />
                  <Input type="number" min="0" step="0.01" placeholder="Importe anual" value={manualDraft.annualAmount || ''} onChange={(event) => setManualDraft({ ...manualDraft, annualAmount: Number(event.target.value), monthlyAmount: 0 })} />
                  <ActionButton iconOnly={false} size="sm" variant="add" onClick={addManualItem}>Añadir</ActionButton>
                </div>
              </Panel>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton iconOnly={false} variant="save" onClick={saveSimulation}>Guardar simulación</ActionButton>
              <ActionButton iconOnly={false} variant="primary" onClick={() => { saveSimulation(); setComparisonYear(activeScenario.year); setStage('compare'); }}>Comparar escenarios <ChevronRight size={15} /></ActionButton>
            </div>
          </div>
        )
      )}

      {stage === 'compare' && (
        <div className="space-y-4">
          <Panel title="Comparativa de escenarios" subtitle="Todos los escenarios del ejercicio se comparan con la misma base de cálculo.">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <Field label="Ejercicio">
                <Select value={comparisonYear} onChange={(event) => setComparisonYear(Number(event.target.value))}>
                  {[...new Set(visibleScenarios.map((scenario) => scenario.year))].sort((a, b) => b - a).map((year) => <option key={year} value={year}>{year}</option>)}
                </Select>
              </Field>
              <p className="text-xs text-metro-muted">Selecciona el escenario que se llevará a Dirección / ejecución.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {yearScenarios.map((scenario) => {
                const total = calculateBudgetScenarioYear(scenario, manualItems, ticketGroups, scenario.year, calendars, people);
                const ticketPlan = scenario.ticketPlanningMode === 'automatic' ? buildAutomaticTicketPlan(scenario, scenario.year, calendars, people) : null;
                return (
                  <div key={scenario.id} className={cx('rounded-xl border p-3', scenario.selectedForExecution ? 'border-emerald-500/45 bg-emerald-500/[0.055]' : 'border-metro-border bg-metro-surface/55')}>
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-bold text-metro-text">{scenario.name}</p><p className="text-[11px] text-metro-muted">Ticket {euro(scenario.ticketAmount)} · absentismo {(scenario.ticketAbsenceRateA ?? 0.03) * 100}%</p></div>
                      {scenario.selectedForExecution ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">Elegido</span> : null}
                    </div>
                    <p className="mt-3 text-2xl font-extrabold text-metro-text">{euro(total.total)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-metro-muted"><span>Ticket: <strong className="text-metro-text">{euro(total.ticketTotal)}</strong></span><span>Partidas: <strong className="text-metro-text">{euro(total.manualTotal)}</strong></span></div>
                    {ticketPlan ? <p className="mt-2 text-[10px] text-metro-muted">Sensibilidad con absentismo B: {euro(ticketPlan.annualAmountB + total.manualTotal)}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButton size="sm" iconOnly={false} variant={scenario.selectedForExecution ? 'approve' : 'primary'} onClick={() => chooseScenario(scenario)}>{scenario.selectedForExecution ? 'Seleccionado' : 'Seleccionar'}</ActionButton>
                      <ActionButton size="sm" iconOnly={false} variant="secondary" onClick={() => { setActiveScenario(scenario.id); setStage('simulate'); }}>Editar</ActionButton>
                      <ActionButton size="sm" iconOnly={false} variant="delete" onClick={() => confirmAndRemoveScenario(scenario)}>{scenario.finalizedAt ? 'Eliminar presupuesto' : 'Eliminar escenario'}</ActionButton>
                    </div>
                  </div>
                );
              })}
              {yearScenarios.length === 0 ? <p className="text-sm text-metro-muted">No hay escenarios para este año.</p> : null}
            </div>
          </Panel>
          {selectedScenario ? (
            <div className="flex justify-end"><ActionButton iconOnly={false} variant="primary" onClick={() => setStage('execute')}>Ajustar presupuesto definitivo <ChevronRight size={15} /></ActionButton></div>
          ) : null}
        </div>
      )}

      {stage === 'execute' && (
        !selectedScenario ? (
          <Notice>Selecciona primero el escenario que se va a ejecutar.</Notice>
        ) : (
          <div className="space-y-4">
            <Panel title={`Presupuesto definitivo · ${selectedScenario.name}`} subtitle="Dirección puede modificar los importes por partida. Estos valores sustituyen a la simulación cuando guardas como definitivo.">
              <div className="mb-3 grid gap-2 sm:grid-cols-3">
                <Metric label="Simulación seleccionada" value={euro(calculateBudgetScenarioYear(selectedScenario, manualItems, ticketGroups, selectedScenario.year, calendars, people).total)} />
                <Metric label="Definitivo en edición" value={euro(finalPreviewTotal)} />
                <Metric label="Estado" value={selectedScenario.finalizedAt ? 'Definitivo guardado' : 'Pendiente de cierre'} />
              </div>
              <div className="rounded-xl border border-metro-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-metro-raised text-metro-muted"><tr><th className="px-3 py-2 text-left">Partida</th><th className="px-3 py-2 text-left">Tipo</th><th className="px-3 py-2 text-right">Importe definitivo</th></tr></thead>
                  <tbody>
                    <tr className="border-t border-metro-border/70"><td className="px-3 py-2 font-bold text-metro-text">Ticket Restaurante</td><td className="px-3 py-2 text-metro-muted">Cálculo de escenario</td><td className="p-1.5"><Input className="ml-auto h-8 max-w-[180px] text-right" type="number" min="0" step="0.01" value={finalAmounts.ticket ?? 0} onChange={(event) => setFinalAmounts({ ...finalAmounts, ticket: Number(event.target.value) })} /></td></tr>
                    {selectedManualItems.map((item) => (
                      <tr key={item.id} className="border-t border-metro-border/70"><td className="px-3 py-2 font-semibold text-metro-text">{item.concept}</td><td className="px-3 py-2 text-metro-muted">{item.category || 'Partida manual'}</td><td className="p-1.5"><Input className="ml-auto h-8 max-w-[180px] text-right" type="number" min="0" step="0.01" value={finalAmounts[`manual:${item.id}`] ?? 0} onChange={(event) => setFinalAmounts({ ...finalAmounts, [`manual:${item.id}`]: Number(event.target.value) })} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <ActionButton iconOnly={false} variant="delete" onClick={() => confirmAndRemoveScenario(selectedScenario)}>
                  {selectedScenario.finalizedAt ? 'Eliminar presupuesto definitivo' : 'Eliminar escenario'}
                </ActionButton>
                <ActionButton iconOnly={false} variant="save" onClick={finalizeBudget}>Guardar como definitivo</ActionButton>
              </div>
            </Panel>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.4fr]">
              <Panel title="Registrar ejecución" subtitle="Añade gasto real por mes y bloque.">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Mes"><Select value={actualDraft.month} onChange={(event) => setActualDraft({ ...actualDraft, month: Number(event.target.value) })}>{BUDGET_MONTHS.map((month) => <option key={month} value={month}>{MONTH_NAMES[month - 1]}</option>)}</Select></Field>
                  <Field label="Bloque"><Select value={actualDraft.block} onChange={(event) => setActualDraft({ ...actualDraft, block: event.target.value as BudgetActualBlock })}>{BUDGET_ACTUAL_BLOCKS.map((block) => <option key={block} value={block}>{block}</option>)}</Select></Field>
                  <Field label="Concepto"><Input value={actualDraft.concept} onChange={(event) => setActualDraft({ ...actualDraft, concept: event.target.value })} /></Field>
                  <Field label="Importe (€)"><Input type="number" min="0" step="0.01" value={actualDraft.amount || ''} onChange={(event) => setActualDraft({ ...actualDraft, amount: Number(event.target.value) })} /></Field>
                </div>
                <div className="mt-3 flex justify-end"><ActionButton iconOnly={false} size="sm" variant="add" onClick={saveActual}>Añadir ejecutado</ActionButton></div>
                <div className="mt-3 max-h-[220px] overflow-y-auto rounded-xl border border-metro-border">
                  {actuals.filter((actual) => !actual.deletedAt && actual.year === selectedScenario.year).slice().sort((a, b) => b.month - a.month).map((actual) => (
                    <div key={actual.id} className="flex items-center gap-2 border-b border-metro-border/70 px-3 py-2 last:border-b-0"><span className="w-20 text-[11px] text-metro-muted">{MONTH_NAMES[actual.month - 1]}</span><span className="min-w-0 flex-1 truncate text-xs text-metro-text">{actual.concept}</span><strong className="text-xs text-metro-text">{euro(actual.amount)}</strong><button className="text-red-300" type="button" onClick={() => removeActual(actual.id)}><Trash2 size={13} /></button></div>
                  ))}
                </div>
              </Panel>

              <Panel title="Presupuesto vs. real ejecutado" subtitle="Seguimiento acumulado del ejercicio seleccionado.">
                <div className="mb-3 flex items-end justify-between gap-3">
                  <Field label="Mes de corte"><Select value={cutoffMonth} onChange={(event) => setCutoffMonth(Number(event.target.value))}>{BUDGET_MONTHS.map((month) => <option key={month} value={month}>{MONTH_NAMES[month - 1]}</option>)}</Select></Field>
                  {selectedScenario.finalizedAt ? <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">Usando presupuesto definitivo</span> : <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-300">Usando simulación</span>}
                </div>
                {executionDashboard ? (
                  <>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <Metric label="Presupuesto" value={euro(executionDashboard.budgetTotal)} />
                      <Metric label="Ejecutado" value={euro(executionDashboard.actualTotal)} />
                      <Metric label="Disponible" value={euro(executionDashboard.difference)} />
                      <Metric label="Desviación" value={percent(executionDashboard.differenceRate)} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {executionDashboard.rows.map((row) => {
                        const usedRate = row.budgetTotal ? row.actualTotal / row.budgetTotal : 0;
                        return (
                          <div key={row.block} className="rounded-xl border border-metro-border bg-metro-surface/45 p-3">
                            <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-metro-text">{row.block}</span><span className="text-xs text-metro-muted">{euro(row.actualTotal)} / {euro(row.budgetTotal)}</span></div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-metro-raised"><div className={cx('h-full rounded-full', usedRate > 1 ? 'bg-red-500' : usedRate > 0.85 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(Math.max(usedRate, 0), 1) * 100}%` }} /></div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </Panel>
            </div>
          </div>
        )
      )}
    </div>
  );
}
