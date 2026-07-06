import { Calculator } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ExportColumn } from '../../../shared/export/types';
import { ExportPrintButtons } from '../../../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../../../shared/table/DataTable';
import { InlineSaveFeedback } from '../../../components/InlineSaveFeedback';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { ActionButton } from '../../../components/ui/ActionButton';
import { FieldLabel, Input, Select } from '../../../components/ui/Field';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useTicketRestauranteStore } from '../../ticket-restaurante/store/useTicketRestauranteStore';
import {
  BUDGET_ACTUAL_BLOCKS,
  BUDGET_MONTHS,
  buildBudgetActualDashboardData,
  buildBudgetComparisonData,
  buildBudgetScenarioExportData,
  calculateBudgetManualItemMonth,
  calculateBudgetManualItemYear,
  calculateBudgetScenarioYear,
  type BudgetActual,
  type BudgetActualBlock,
  type BudgetActualComparisonRow,
  type BudgetComparisonRow,
  type BudgetManualItem,
  type BudgetScenario,
  type BudgetScenarioExportRow,
  type BudgetScenarioMonthlyTotal,
  type BudgetTicketCalculationType,
  type BudgetTicketGroup,
} from '../domain/presupuestos';
import { usePresupuestosStore, type BudgetActualDraft, type BudgetManualItemDraft, type BudgetScenarioDraft, type BudgetTicketGroupDraft } from '../store/usePresupuestosStore';

const PRESUPUESTOS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Permite crear escenarios presupuestarios anuales de RRLL, combinando conceptos manuales con grupos de Ticket Restaurante, y compararlos entre sí o frente al gasto real ejecutado.',
  },
  {
    title: 'Conceptos manuales',
    items: [
      'Cada concepto puede definirse con un importe mensual o con un importe anual directo.',
      'Si se informa el importe anual, este tiene prioridad: el mensual se calcula dividiéndolo entre 12. Si no hay importe anual, el anual se calcula multiplicando el mensual por 12.',
    ],
  },
  {
    title: 'Grupos de Ticket Restaurante: 4 formas de calcular',
    items: [
      'Personas por calendario: días con derecho a ticket del calendario asignado × nº de personas × (1 − % de ausentismo) × precio del ticket. Es el cálculo más ajustado a la realidad, siempre que el calendario y el nº de personas estén bien informados.',
      'Tickets mensuales: un nº de tickets manual cada mes × precio del ticket.',
      'Tickets anuales: un nº de tickets manual para todo el año × precio del ticket; para la vista mensual se reparte entre 12.',
      'Importe manual: un importe fijo cada mes (× 12 para el anual), sin ningún cálculo de días o personas.',
      'Cada grupo puede tener su propio precio de ticket o heredar el precio general definido en el escenario.',
    ],
  },
  {
    title: 'Comparativa entre escenarios',
    items: [
      'Permite comparar dos escenarios del mismo año mes a mes, mostrando la diferencia en importe y en porcentaje.',
      'Es la forma recomendada de valorar una alternativa (por ejemplo, subir el precio del ticket o cambiar una plantilla) sin tocar el escenario original: duplica el escenario y compáralo con el de partida.',
    ],
  },
  {
    title: 'Comparativa con lo real ejecutado',
    items: [
      'Se pueden registrar importes reales ejecutados por año, mes, bloque (Ticket Restaurante, Formación, Vestuario, Consultoría, Reconocimientos médicos, Gastos sindicales, Otros) y concepto.',
      'La comparativa acumula el presupuesto hasta un mes de corte elegido y lo enfrenta a lo realmente gastado en ese periodo, separando "Ticket Restaurante" del resto de partidas manuales.',
      'Muestra la diferencia total y por bloque, en importe y en porcentaje, para detectar desviaciones cuanto antes.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Crea un escenario por año y añade primero los grupos de Ticket Restaurante (suelen ser el bloque más previsible) y después los conceptos manuales.',
      'Duplica escenarios cuando quieras probar una alternativa sin perder el cálculo original.',
      'Revisa la comparativa antes de exportar para comprobar que meses, importes y grupos son coherentes.',
    ],
  },
];

type ScenarioColumnId = 'name' | 'year' | 'ticket' | 'manual' | 'ticketTotal' | 'total' | 'actions';
type ManualColumnId = 'concept' | 'category' | 'monthly' | 'annual' | 'total' | 'actions';
type TicketColumnId = 'name' | 'type' | 'people' | 'calendar' | 'amount' | 'actions';
type MonthColumnId = 'month' | 'manual' | 'ticket' | 'total';
type ActualColumnId = 'year' | 'month' | 'block' | 'concept' | 'amount' | 'actions';
type ComparisonColumnId = 'month' | 'scenarioATotal' | 'scenarioBTotal' | 'difference' | 'differenceRate';
type ActualComparisonColumnId = 'block' | 'budgetTotal' | 'actualTotal' | 'difference' | 'differenceRate';

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const calculationTypeLabels: Record<BudgetTicketCalculationType, string> = {
  calendar_people: 'Personas por calendario',
  manual_tickets: 'Tickets mensuales',
  annual_tickets: 'Tickets anuales',
  manual_amount: 'Importe manual',
};

const emptyScenarioDraft = (year = new Date().getFullYear()): BudgetScenarioDraft => ({ name: '', year, ticketAmount: 0, notes: '' });
const emptyManualDraft = (scenarioId: string): BudgetManualItemDraft => ({ scenarioId, concept: '', category: '', monthlyAmount: 0, annualAmount: 0, notes: '' });
const emptyTicketDraft = (scenarioId: string, ticketAmount: number): BudgetTicketGroupDraft => ({
  scenarioId,
  name: '',
  peopleCount: 0,
  ticketCalendar: '',
  absenceRate: 0,
  ticketAmount,
  calculationType: 'calendar_people',
  manualTickets: 0,
  annualTickets: 0,
  manualMonthlyAmount: 0,
  notes: '',
});
const emptyActualDraft = (year = new Date().getFullYear()): BudgetActualDraft => ({ year, month: 1, block: 'Ticket Restaurante', concept: '', amount: 0, notes: '' });

function euro(value: number): string {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function percent(value: number): string {
  return value.toLocaleString('es-ES', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function NumberField({ label, min = 0, onChange, step = '0.01', value }: { label: string; min?: number; onChange: (value: number) => void; step?: string; value: number }) {
  return (
    <FieldLabel className="space-y-1">
      {label}
      <Input className="mt-1" min={min} onChange={(event) => onChange(Number(event.target.value))} step={step} type="number" value={value} />
    </FieldLabel>
  );
}

function TextField({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <FieldLabel className="space-y-1">
      {label}
      <Input className="mt-1" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type="text" value={value} />
    </FieldLabel>
  );
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-2xl border border-metro-border bg-metro-panel p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-metro-text"><Calculator size={18} className="text-metro-red" />{title}</h3>
      {children}
    </section>
  );
}

const scenarioExportColumns: ExportColumn<BudgetScenarioExportRow>[] = [
  { key: 'block', header: 'Bloque', value: (row) => row.block },
  { key: 'concept', header: 'Concepto', value: (row) => row.concept },
  { key: 'category', header: 'Categoría / tipo', value: (row) => row.category },
  { key: 'annualTotal', header: 'Total anual', value: (row) => row.annualTotal },
  { key: 'notes', header: 'Notas', value: (row) => row.notes },
];
const comparisonExportColumns: ExportColumn<BudgetComparisonRow>[] = [
  { key: 'month', header: 'Mes', value: (row) => MONTH_NAMES[row.month - 1] },
  { key: 'scenarioATotal', header: 'Escenario A', value: (row) => row.scenarioATotal },
  { key: 'scenarioBTotal', header: 'Escenario B', value: (row) => row.scenarioBTotal },
  { key: 'difference', header: 'Diferencia €', value: (row) => row.difference },
  { key: 'differenceRate', header: 'Diferencia %', value: (row) => percent(row.differenceRate) },
];
const actualComparisonExportColumns: ExportColumn<BudgetActualComparisonRow>[] = [
  { key: 'block', header: 'Bloque', value: (row) => row.block },
  { key: 'budgetTotal', header: 'Presupuesto', value: (row) => row.budgetTotal },
  { key: 'actualTotal', header: 'Real', value: (row) => row.actualTotal },
  { key: 'difference', header: 'Desviación €', value: (row) => row.difference },
  { key: 'differenceRate', header: 'Desviación %', value: (row) => percent(row.differenceRate) },
];

export function PresupuestosPage() {
  const { calendars, load: loadTicketData } = useTicketRestauranteStore();
  const { activeScenarioId, actuals, duplicateScenario, load, manualItems, removeActual, removeManualItem, removeScenario, removeTicketGroup, scenarios, setActiveScenario, ticketGroups, upsertActual, upsertManualItem, upsertScenario, upsertTicketGroup } = usePresupuestosStore();
  const [scenarioDraft, setScenarioDraft] = useState<BudgetScenarioDraft>(emptyScenarioDraft());
  const [editingScenarioId, setEditingScenarioId] = useState<string | undefined>();
  const [manualDraft, setManualDraft] = useState<BudgetManualItemDraft>(emptyManualDraft(''));
  const [editingManualId, setEditingManualId] = useState<string | undefined>();
  const [ticketDraft, setTicketDraft] = useState<BudgetTicketGroupDraft>(emptyTicketDraft('', 0));
  const [editingTicketId, setEditingTicketId] = useState<string | undefined>();
  const [actualDraft, setActualDraft] = useState<BudgetActualDraft>(emptyActualDraft());
  const [editingActualId, setEditingActualId] = useState<string | undefined>();
  const [simulationYear, setSimulationYear] = useState(new Date().getFullYear());
  const [lastCalculationAt, setLastCalculationAt] = useState<string>('Sin calcular');
  const [comparisonAId, setComparisonAId] = useState('');
  const [comparisonBId, setComparisonBId] = useState('');
  const [comparisonYear, setComparisonYear] = useState(new Date().getFullYear());
  const [actualScenarioId, setActualScenarioId] = useState('');
  const [actualYear, setActualYear] = useState(new Date().getFullYear());
  const [cutoffMonth, setCutoffMonth] = useState(12);
  const [message, setMessage] = useState('');

  useEffect(() => { load(); loadTicketData(); }, [load, loadTicketData]);

  const visibleScenarios = useMemo(() => scenarios.filter((scenario) => !scenario.deletedAt), [scenarios]);
  const activeScenario = visibleScenarios.find((scenario) => scenario.id === activeScenarioId) ?? visibleScenarios[0] ?? null;
  const currentActiveScenarioId = activeScenario?.id ?? null;

  useEffect(() => {
    if (activeScenario) {
      setSimulationYear(activeScenario.year);
      setManualDraft(emptyManualDraft(activeScenario.id));
      setTicketDraft(emptyTicketDraft(activeScenario.id, activeScenario.ticketAmount));
      setActualDraft(emptyActualDraft(activeScenario.year));
      setActualYear(activeScenario.year);
      setActualScenarioId(activeScenario.id);
      setComparisonAId((current) => current || activeScenario.id);
    }
  }, [activeScenario]);

  const activeYearTotal = useMemo(() => activeScenario ? calculateBudgetScenarioYear(activeScenario, manualItems, ticketGroups, simulationYear, calendars) : null, [activeScenario, calendars, manualItems, simulationYear, ticketGroups]);
  const activeManualItems = useMemo(() => manualItems.filter((item) => !item.deletedAt && item.scenarioId === currentActiveScenarioId).sort((a, b) => a.displayOrder - b.displayOrder), [currentActiveScenarioId, manualItems]);
  const activeTicketGroups = useMemo(() => ticketGroups.filter((group) => !group.deletedAt && group.scenarioId === currentActiveScenarioId).sort((a, b) => a.displayOrder - b.displayOrder), [currentActiveScenarioId, ticketGroups]);
  const scenarioExportRows = useMemo(() => activeScenario ? buildBudgetScenarioExportData(activeScenario, manualItems, ticketGroups, simulationYear, calendars) : [], [activeScenario, calendars, manualItems, simulationYear, ticketGroups]);
  const comparisonRows = useMemo(() => {
    const scenarioA = visibleScenarios.find((scenario) => scenario.id === comparisonAId);
    const scenarioB = visibleScenarios.find((scenario) => scenario.id === comparisonBId);
    return scenarioA && scenarioB ? buildBudgetComparisonData(scenarioA, scenarioB, manualItems, ticketGroups, comparisonYear, calendars) : [];
  }, [calendars, comparisonAId, comparisonBId, comparisonYear, manualItems, ticketGroups, visibleScenarios]);
  const actualDashboard = useMemo(() => {
    const scenario = visibleScenarios.find((item) => item.id === actualScenarioId) ?? activeScenario;
    return scenario ? buildBudgetActualDashboardData(scenario, manualItems, ticketGroups, actuals, actualYear, cutoffMonth, calendars) : null;
  }, [activeScenario, actualScenarioId, actualYear, actuals, calendars, cutoffMonth, manualItems, ticketGroups, visibleScenarios]);

  const scenarioColumns = useMemo<Array<DataTableColumn<BudgetScenario, ScenarioColumnId>>>(() => [
    { id: 'name', header: 'Escenario', accessor: (row) => row.name, width: 180 },
    { id: 'year', header: 'Año sugerido', accessor: (row) => row.year, width: 110 },
    { id: 'ticket', header: 'Importe ticket', accessor: (row) => row.ticketAmount, render: (row) => euro(row.ticketAmount), width: 120 },
    { id: 'manual', header: 'Partidas manuales', accessor: (row) => calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).manualTotal, render: (row) => euro(calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).manualTotal), width: 140 },
    { id: 'ticketTotal', header: 'Ticket Restaurante', accessor: (row) => calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).ticketTotal, render: (row) => euro(calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).ticketTotal), width: 140 },
    { id: 'total', header: 'Total global', accessor: (row) => calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).total, render: (row) => euro(calculateBudgetScenarioYear(row, manualItems, ticketGroups, row.year, calendars).total), width: 120 },
    { id: 'actions', header: 'Acciones', width: 220, isActionColumn: true, render: (row) => <div className="flex flex-wrap justify-end gap-1"><ActionButton onClick={(event) => { event.stopPropagation(); setActiveScenario(row.id); }} size="sm" title="Activar escenario" type="button" variant="secondary" iconOnly={false}>Activar</ActionButton><ActionButton onClick={(event) => { event.stopPropagation(); setScenarioDraft({ name: row.name, year: row.year, ticketAmount: row.ticketAmount, notes: row.notes }); setEditingScenarioId(row.id); }} size="sm" title="Editar escenario" type="button" variant="edit" /><ActionButton onClick={(event) => { event.stopPropagation(); duplicateScenario(row.id); }} size="sm" title="Duplicar escenario" type="button" variant="duplicate" /><ActionButton onClick={(event) => { event.stopPropagation(); removeScenario(row.id); }} size="sm" title="Eliminar escenario" type="button" variant="delete" /></div> },
  ], [calendars, duplicateScenario, manualItems, removeScenario, setActiveScenario, ticketGroups]);

  const manualColumns: Array<DataTableColumn<BudgetManualItem, ManualColumnId>> = [
    { id: 'concept', header: 'Concepto', accessor: (row) => row.concept, width: 180 },
    { id: 'category', header: 'Categoría', accessor: (row) => row.category, width: 130 },
    { id: 'monthly', header: 'Mensual', accessor: (row) => row.monthlyAmount, render: (row) => euro(row.monthlyAmount), width: 100 },
    { id: 'annual', header: 'Anual informado', accessor: (row) => row.annualAmount, render: (row) => euro(row.annualAmount), width: 120 },
    { id: 'total', header: 'Total anual', accessor: calculateBudgetManualItemYear, render: (row) => euro(calculateBudgetManualItemYear(row)), width: 110 },
    { id: 'actions', header: 'Acciones', width: 110, isActionColumn: true, render: (row) => <div className="flex justify-end gap-1"><ActionButton onClick={() => { setManualDraft({ scenarioId: row.scenarioId, concept: row.concept, category: row.category, monthlyAmount: row.monthlyAmount, annualAmount: row.annualAmount, notes: row.notes }); setEditingManualId(row.id); }} size="sm" title="Editar partida" type="button" variant="edit" /><ActionButton onClick={() => removeManualItem(row.id)} size="sm" title="Eliminar partida" type="button" variant="delete" /></div> },
  ];
  const ticketColumns: Array<DataTableColumn<BudgetTicketGroup, TicketColumnId>> = [
    { id: 'name', header: 'Grupo', accessor: (row) => row.name, width: 170 },
    { id: 'type', header: 'Tipo', accessor: (row) => calculationTypeLabels[row.calculationType], width: 150 },
    { id: 'people', header: 'Personas', accessor: (row) => row.peopleCount, width: 90 },
    { id: 'calendar', header: 'Calendario', accessor: (row) => row.ticketCalendar, width: 140 },
    { id: 'amount', header: 'Total anual', accessor: (row) => activeScenario ? calculateBudgetScenarioYear(activeScenario, [], [row], simulationYear, calendars).ticketTotal : 0, render: (row) => activeScenario ? euro(calculateBudgetScenarioYear(activeScenario, [], [row], simulationYear, calendars).ticketTotal) : '—', width: 110 },
    { id: 'actions', header: 'Acciones', width: 110, isActionColumn: true, render: (row) => <div className="flex justify-end gap-1"><ActionButton onClick={() => { setTicketDraft({ scenarioId: row.scenarioId, name: row.name, peopleCount: row.peopleCount, ticketCalendar: row.ticketCalendar, absenceRate: row.absenceRate, ticketAmount: row.ticketAmount, calculationType: row.calculationType, manualTickets: row.manualTickets, annualTickets: row.annualTickets, manualMonthlyAmount: row.manualMonthlyAmount, notes: row.notes }); setEditingTicketId(row.id); }} size="sm" title="Editar grupo" type="button" variant="edit" /><ActionButton onClick={() => removeTicketGroup(row.id)} size="sm" title="Eliminar grupo" type="button" variant="delete" /></div> },
  ];
  const monthColumns: Array<DataTableColumn<BudgetScenarioMonthlyTotal, MonthColumnId>> = [
    { id: 'month', header: 'Mes', accessor: (row) => row.month, render: (row) => MONTH_NAMES[row.month - 1], width: 110 },
    { id: 'manual', header: 'Partidas manuales', accessor: (row) => row.manualTotal, render: (row) => euro(row.manualTotal), width: 140 },
    { id: 'ticket', header: 'Ticket Restaurante', accessor: (row) => row.ticketTotal, render: (row) => euro(row.ticketTotal), width: 140 },
    { id: 'total', header: 'Total global', accessor: (row) => row.total, render: (row) => euro(row.total), width: 120 },
  ];
  const actualColumns: Array<DataTableColumn<BudgetActual, ActualColumnId>> = [
    { id: 'year', header: 'Año', accessor: (row) => row.year, width: 80 },
    { id: 'month', header: 'Mes', accessor: (row) => row.month, render: (row) => MONTH_NAMES[row.month - 1], width: 100 },
    { id: 'block', header: 'Bloque', accessor: (row) => row.block, width: 170 },
    { id: 'concept', header: 'Concepto', accessor: (row) => row.concept, width: 180 },
    { id: 'amount', header: 'Importe', accessor: (row) => row.amount, render: (row) => euro(row.amount), width: 100 },
    { id: 'actions', header: 'Acciones', width: 100, isActionColumn: true, render: (row) => <div className="flex justify-end gap-1"><ActionButton onClick={() => { setActualDraft({ year: row.year, month: row.month, block: row.block, concept: row.concept, amount: row.amount, notes: row.notes }); setEditingActualId(row.id); }} size="sm" title="Editar real" type="button" variant="edit" /><ActionButton onClick={() => removeActual(row.id)} size="sm" title="Eliminar real" type="button" variant="delete" /></div> },
  ];

  const comparisonTableColumns: Array<DataTableColumn<BudgetComparisonRow, ComparisonColumnId>> = [
    { id: 'month', header: 'Mes', accessor: (row) => row.month, render: (row) => MONTH_NAMES[row.month - 1], width: 120 },
    { id: 'scenarioATotal', header: 'Escenario A', accessor: (row) => row.scenarioATotal, render: (row) => euro(row.scenarioATotal), width: 130 },
    { id: 'scenarioBTotal', header: 'Escenario B', accessor: (row) => row.scenarioBTotal, render: (row) => euro(row.scenarioBTotal), width: 130 },
    { id: 'difference', header: 'Diferencia €', accessor: (row) => row.difference, render: (row) => euro(row.difference), width: 130 },
    { id: 'differenceRate', header: 'Diferencia %', accessor: (row) => row.differenceRate, render: (row) => percent(row.differenceRate), width: 130 },
  ];
  const actualComparisonTableColumns: Array<DataTableColumn<BudgetActualComparisonRow, ActualComparisonColumnId>> = [
    { id: 'block', header: 'Bloque', accessor: (row) => row.block, width: 170 },
    { id: 'budgetTotal', header: 'Presupuesto', accessor: (row) => row.budgetTotal, render: (row) => euro(row.budgetTotal), width: 130 },
    { id: 'actualTotal', header: 'Real', accessor: (row) => row.actualTotal, render: (row) => euro(row.actualTotal), width: 130 },
    { id: 'difference', header: 'Desviación €', accessor: (row) => row.difference, render: (row) => euro(row.difference), width: 130 },
    { id: 'differenceRate', header: 'Desviación %', accessor: (row) => row.differenceRate, render: (row) => percent(row.differenceRate), width: 130 },
  ];

  const saveScenario = () => {
    const result = upsertScenario(scenarioDraft, editingScenarioId);
    setMessage(result.valid ? 'Escenario guardado.' : result.errors.join(' '));
    if (result.valid) { setScenarioDraft(emptyScenarioDraft(scenarioDraft.year)); setEditingScenarioId(undefined); }
  };
  const saveManual = () => {
    if (!activeScenario) return;
    const result = upsertManualItem({ ...manualDraft, scenarioId: activeScenario.id }, editingManualId);
    setMessage(result.valid ? 'Partida manual guardada.' : result.errors.join(' '));
    if (result.valid) { setManualDraft(emptyManualDraft(activeScenario.id)); setEditingManualId(undefined); }
  };
  const saveTicket = () => {
    if (!activeScenario) return;
    const result = upsertTicketGroup({ ...ticketDraft, scenarioId: activeScenario.id }, editingTicketId);
    setMessage(result.valid ? 'Grupo Ticket guardado.' : result.errors.join(' '));
    if (result.valid) { setTicketDraft(emptyTicketDraft(activeScenario.id, activeScenario.ticketAmount)); setEditingTicketId(undefined); }
  };
  const saveActual = () => {
    const result = upsertActual(actualDraft, editingActualId);
    setMessage(result.valid ? 'Real ejecutado guardado.' : result.errors.join(' '));
    if (result.valid) { setActualDraft(emptyActualDraft(actualDraft.year)); setEditingActualId(undefined); }
  };

  return (
    <div className="space-y-5 pb-8">
      <div className="rounded-2xl border border-metro-border bg-metro-panel p-5">
        <PageHeader
          eyebrow="Herramientas RRLL"
          title="Presupuestos RRLL"
          subtitle="Escenarios, simulación anual, Ticket Restaurante, comparativas y reales ejecutados."
          helpSections={PRESUPUESTOS_HELP_SECTIONS}
          helpSubtitle="Guía rápida de escenarios, simulación, tickets, comparativas y reales ejecutados."
          className="mb-0"
        />
        <div className="mt-2"><InlineSaveFeedback /></div>
        {message && <p className="mt-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-muted">{message}</p>}
      </div>

      <Section title="1. Escenarios">
        <div className="grid gap-2 md:grid-cols-5">
          <TextField label="Nombre" onChange={(value) => setScenarioDraft({ ...scenarioDraft, name: value })} value={scenarioDraft.name} />
          <NumberField label="Año sugerido" onChange={(value) => setScenarioDraft({ ...scenarioDraft, year: value })} step="1" value={scenarioDraft.year} />
          <NumberField label="Importe ticket" onChange={(value) => setScenarioDraft({ ...scenarioDraft, ticketAmount: value })} value={scenarioDraft.ticketAmount} />
          <TextField label="Notas" onChange={(value) => setScenarioDraft({ ...scenarioDraft, notes: value })} value={scenarioDraft.notes} />
          <ActionButton className="mt-5" iconOnly={false} onClick={saveScenario} variant="save">{editingScenarioId ? 'Guardar escenario' : 'Nuevo escenario'}</ActionButton>
        </div>
        <DataTable ariaLabel="Escenarios de presupuesto" columnWidths={{}} columns={scenarioColumns} emptyMessage="No hay escenarios." getRowId={(row) => row.id} onColumnWidthChange={() => undefined} onRowClick={(row) => setActiveScenario(row.id)} onSortChange={() => undefined} rows={visibleScenarios} sort={null} />
      </Section>

      {activeScenario && activeYearTotal && (
        <>
          <Section title="2. Escenario activo">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xl font-bold text-metro-text">{activeScenario.name}</p><p className="text-sm text-metro-muted">Año {activeScenario.year} · Ticket base {euro(activeScenario.ticketAmount)} · {activeScenario.notes || 'Sin notas'}</p></div>
              <div className="flex flex-wrap gap-2"><ActionButton iconOnly={false} onClick={() => duplicateScenario(activeScenario.id)} variant="duplicate">Duplicar</ActionButton><ExportPrintButtons payload={{ title: `Presupuesto ${activeScenario.name}`, filename: `presupuesto-${activeScenario.name}`, columns: scenarioExportColumns, rows: scenarioExportRows, filterLabel: `Año ${simulationYear}` }} /></div>
            </div>
          </Section>

          <Section title="3. Simulación anual">
            <div className="flex flex-wrap items-end gap-3"><NumberField label="Año de simulación" onChange={setSimulationYear} step="1" value={simulationYear} /><ActionButton iconOnly={false} onClick={() => setLastCalculationAt(new Date().toLocaleString('es-ES'))} variant="save">Calcular / recalcular</ActionButton><span className="text-sm text-metro-muted">Estado: calculado · Último cálculo: {lastCalculationAt}</span></div>
          </Section>

          <Section title="4. Totales">
            <div className="grid gap-3 md:grid-cols-3">{[['Total partidas manuales', activeYearTotal.manualTotal], ['Ticket Restaurante', activeYearTotal.ticketTotal], ['Total escenario', activeYearTotal.total]].map(([label, value]) => <div className="rounded-xl border border-metro-border bg-metro-surface p-4" key={String(label)}><p className="text-xs font-bold uppercase tracking-wide text-metro-muted">{label}</p><p className="text-2xl font-bold text-metro-text">{euro(Number(value))}</p></div>)}</div>
          </Section>

          <div className="grid gap-5 xl:grid-cols-2">
            <Section title="5A. Partidas manuales">
              <div className="grid gap-2 md:grid-cols-5"><TextField label="Concepto" onChange={(value) => setManualDraft({ ...manualDraft, concept: value })} value={manualDraft.concept} /><TextField label="Categoría" onChange={(value) => setManualDraft({ ...manualDraft, category: value })} value={manualDraft.category} /><NumberField label="Mensual" onChange={(value) => setManualDraft({ ...manualDraft, monthlyAmount: value })} value={manualDraft.monthlyAmount} /><NumberField label="Anual informado" onChange={(value) => setManualDraft({ ...manualDraft, annualAmount: value })} value={manualDraft.annualAmount} /><ActionButton className="mt-5" iconOnly={false} onClick={saveManual} variant="save">Guardar</ActionButton></div>
              <p className="mb-2 text-xs text-metro-muted">Regla: si hay importe anual, prevalece sobre mensual × 12. Mensual equivalente activo: {euro(calculateBudgetManualItemMonth({ monthlyAmount: manualDraft.monthlyAmount, annualAmount: manualDraft.annualAmount }))}</p>
              <DataTable ariaLabel="Partidas manuales" columnWidths={{}} columns={manualColumns} emptyMessage="Sin partidas manuales." getRowId={(row) => row.id} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={activeManualItems} sort={null} />
            </Section>

            <Section title="5B. Ticket Restaurante">
              <div className="grid gap-2 md:grid-cols-3"><TextField label="Grupo" onChange={(value) => setTicketDraft({ ...ticketDraft, name: value })} value={ticketDraft.name} /><FieldLabel className="space-y-1">Tipo<Select className="mt-1" onChange={(event) => setTicketDraft({ ...ticketDraft, calculationType: event.target.value as BudgetTicketCalculationType })} value={ticketDraft.calculationType}>{Object.entries(calculationTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FieldLabel><NumberField label="Importe ticket" onChange={(value) => setTicketDraft({ ...ticketDraft, ticketAmount: value })} value={ticketDraft.ticketAmount} />{ticketDraft.calculationType === 'calendar_people' && <><NumberField label="Personas" onChange={(value) => setTicketDraft({ ...ticketDraft, peopleCount: value })} value={ticketDraft.peopleCount} /><TextField label="Calendario" onChange={(value) => setTicketDraft({ ...ticketDraft, ticketCalendar: value })} placeholder="SSCC" value={ticketDraft.ticketCalendar} /><NumberField label="Absentismo (0-1)" onChange={(value) => setTicketDraft({ ...ticketDraft, absenceRate: value })} step="0.01" value={ticketDraft.absenceRate} /></>}{ticketDraft.calculationType === 'manual_tickets' && <NumberField label="Tickets mensuales" onChange={(value) => setTicketDraft({ ...ticketDraft, manualTickets: value })} value={ticketDraft.manualTickets} />}{ticketDraft.calculationType === 'annual_tickets' && <NumberField label="Tickets anuales" onChange={(value) => setTicketDraft({ ...ticketDraft, annualTickets: value })} value={ticketDraft.annualTickets} />}{ticketDraft.calculationType === 'manual_amount' && <NumberField label="Importe mensual" onChange={(value) => setTicketDraft({ ...ticketDraft, manualMonthlyAmount: value })} value={ticketDraft.manualMonthlyAmount} />}<ActionButton iconOnly={false} onClick={saveTicket} variant="save">Guardar grupo</ActionButton></div>
              <p className="mb-2 text-xs text-metro-muted">Calendarios disponibles: {calendars.filter((calendar) => !calendar.deletedAt).map((calendar) => calendar.nombre).join(', ') || 'sin calendarios'}</p>
              <DataTable ariaLabel="Grupos Ticket Restaurante" columnWidths={{}} columns={ticketColumns} emptyMessage="Sin grupos Ticket." getRowId={(row) => row.id} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={activeTicketGroups} sort={null} />
            </Section>
          </div>

          <Section title="6. Resumen mensual">
            <DataTable ariaLabel="Resumen mensual" columnWidths={{}} columns={monthColumns} emptyMessage="Sin cálculo mensual." getRowId={(row) => String(row.month)} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={activeYearTotal.months} sort={null} />
          </Section>
        </>
      )}

      <Section title="7. Comparativa de escenarios">
        <div className="flex flex-wrap items-end gap-3"><FieldLabel className="text-xs">Escenario A<Select className="mt-1" onChange={(event) => setComparisonAId(event.target.value)} value={comparisonAId}><option value="">Selecciona</option>{visibleScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</Select></FieldLabel><FieldLabel className="text-xs">Escenario B<Select className="mt-1" onChange={(event) => setComparisonBId(event.target.value)} value={comparisonBId}><option value="">Selecciona</option>{visibleScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</Select></FieldLabel><NumberField label="Año" onChange={setComparisonYear} step="1" value={comparisonYear} /><ExportPrintButtons payload={{ title: 'Comparativa de escenarios', filename: 'comparativa-presupuestos', columns: comparisonExportColumns, rows: comparisonRows, filterLabel: `Año ${comparisonYear}` }} /></div>
        <DataTable ariaLabel="Comparativa de escenarios" columnWidths={{}} columns={comparisonTableColumns} emptyMessage="Selecciona dos escenarios." getRowId={(row) => String(row.month)} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={comparisonRows} sort={null} />
      </Section>

      <Section title="8. Reales ejecutados">
        <div className="grid gap-2 md:grid-cols-6"><NumberField label="Año" onChange={(value) => setActualDraft({ ...actualDraft, year: value })} step="1" value={actualDraft.year} /><FieldLabel className="text-xs">Mes<Select className="mt-1" onChange={(event) => setActualDraft({ ...actualDraft, month: Number(event.target.value) })} value={actualDraft.month}>{BUDGET_MONTHS.map((month) => <option key={month} value={month}>{MONTH_NAMES[month - 1]}</option>)}</Select></FieldLabel><FieldLabel className="text-xs">Bloque<Select className="mt-1" onChange={(event) => setActualDraft({ ...actualDraft, block: event.target.value as BudgetActualBlock })} value={actualDraft.block}>{BUDGET_ACTUAL_BLOCKS.map((block) => <option key={block} value={block}>{block}</option>)}</Select></FieldLabel><TextField label="Concepto" onChange={(value) => setActualDraft({ ...actualDraft, concept: value })} value={actualDraft.concept} /><NumberField label="Importe" onChange={(value) => setActualDraft({ ...actualDraft, amount: value })} value={actualDraft.amount} /><ActionButton className="mt-5" iconOnly={false} onClick={saveActual} variant="save">Guardar real</ActionButton></div>
        <DataTable ariaLabel="Reales ejecutados" columnWidths={{}} columns={actualColumns} emptyMessage="Sin reales ejecutados." getRowId={(row) => row.id} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={actuals.filter((actual) => !actual.deletedAt)} sort={null} />
      </Section>

      <Section title="9. Presupuesto vs real ejecutado">
        <div className="flex flex-wrap items-end gap-3"><FieldLabel className="text-xs">Escenario<Select className="mt-1" onChange={(event) => setActualScenarioId(event.target.value)} value={actualScenarioId}><option value="">Activo</option>{visibleScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</Select></FieldLabel><NumberField label="Año" onChange={setActualYear} step="1" value={actualYear} /><FieldLabel className="text-xs">Mes de corte<Select className="mt-1" onChange={(event) => setCutoffMonth(Number(event.target.value))} value={cutoffMonth}>{BUDGET_MONTHS.map((month) => <option key={month} value={month}>{MONTH_NAMES[month - 1]}</option>)}</Select></FieldLabel>{actualDashboard && <ExportPrintButtons payload={{ title: 'Presupuesto vs real ejecutado', filename: 'presupuesto-vs-real', columns: actualComparisonExportColumns, rows: actualDashboard.rows, filterLabel: `Año ${actualYear}; corte ${MONTH_NAMES[cutoffMonth - 1]}` }} />}</div>
        {actualDashboard && <><div className="my-3 grid gap-3 md:grid-cols-4">{[['Presupuesto acumulado', actualDashboard.budgetTotal], ['Real acumulado', actualDashboard.actualTotal], ['Desviación €', actualDashboard.difference], ['Desviación %', percent(actualDashboard.differenceRate)]].map(([label, value]) => <div className="rounded-xl border border-metro-border bg-metro-surface p-3" key={String(label)}><p className="text-xs font-bold uppercase text-metro-muted">{label}</p><p className="text-xl font-bold text-metro-text">{typeof value === 'number' ? euro(value) : value}</p></div>)}</div><DataTable ariaLabel="Dashboard presupuesto vs real" columnWidths={{}} columns={actualComparisonTableColumns} emptyMessage="Sin datos." getRowId={(row) => row.block} onColumnWidthChange={() => undefined} onSortChange={() => undefined} rows={actualDashboard.rows} sort={null} /></>}
      </Section>
    </div>
  );
}
