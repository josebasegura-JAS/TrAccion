import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import type { ExportColumn } from '../../../shared/export/types';
import type {
  BudgetActualComparisonRow,
  BudgetComparisonRow,
  BudgetScenarioExportRow,
  BudgetTicketCalculationType,
} from '../domain/presupuestos';
import type {
  BudgetActualDraft,
  BudgetManualItemDraft,
  BudgetScenarioDraft,
  BudgetTicketGroupDraft,
} from '../store/usePresupuestosStore';

export const PRESUPUESTOS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Flujo de trabajo',
    ordered: true,
    items: [
      'Crear uno o varios escenarios para un mismo ejercicio.',
      'Simular cada escenario en una única pantalla: Ticket Restaurante y partidas manuales se recalculan mientras modificas los datos.',
      'Comparar los escenarios del año y seleccionar el que se va a llevar a cabo.',
      'Ajustar, si Dirección modifica alguna partida, los importes del escenario elegido y guardarlo como presupuesto definitivo.',
      'Registrar el gasto ejecutado durante el año y controlar presupuesto, ejecutado, disponible y desviación.',
    ],
  },
  {
    title: 'Simulación de Ticket Restaurante',
    items: [
      'La plantilla base se toma de las personas activas con ticket fijo y de sus calendarios configurados en Ticket Restaurante.',
      'Puedes añadir personas previstas por calendario; el número se suma a la base detectada.',
      'Se mantienen dos hipótesis de absentismo editables, por defecto 3 % y 6 %. La hipótesis A alimenta el total principal y la B se muestra como sensibilidad.',
      'Los cambios de absentismo y personas adicionales actualizan los importes de la simulación sin pulsar un botón de cálculo.',
    ],
  },
  {
    title: 'Partidas y presupuesto definitivo',
    items: [
      'Las partidas manuales se editan por concepto, categoría e importe anual dentro de la propia simulación.',
      'Solo puede existir un escenario seleccionado para ejecución por ejercicio.',
      'Tras seleccionarlo, cada partida —incluido Ticket Restaurante— puede recibir un importe definitivo distinto del simulado.',
      'Cuando se guarda como definitivo, el seguimiento contra gasto real utiliza esos importes definitivos.',
    ],
  },
  {
    title: 'Seguimiento de ejecución',
    items: [
      'El gasto real se registra por mes, bloque y concepto.',
      'El panel de seguimiento permite elegir el mes de corte y muestra presupuesto acumulado, ejecutado, disponible y desviación.',
      'Mientras el escenario no esté cerrado como definitivo, el seguimiento utiliza la simulación seleccionada.',
    ],
  },
];

export type ScenarioColumnId =
  | 'name'
  | 'year'
  | 'ticket'
  | 'manual'
  | 'ticketTotal'
  | 'total'
  | 'actions';
export type ManualColumnId = 'concept' | 'category' | 'monthly' | 'annual' | 'total' | 'actions';
export type TicketColumnId = 'name' | 'type' | 'people' | 'calendar' | 'amount' | 'actions';
export type MonthColumnId = 'month' | 'manual' | 'ticket' | 'total';
export type ActualColumnId = 'year' | 'month' | 'block' | 'concept' | 'amount' | 'actions';
export type ComparisonColumnId =
  | 'month'
  | 'scenarioATotal'
  | 'scenarioBTotal'
  | 'difference'
  | 'differenceRate';
export type ActualComparisonColumnId =
  | 'block'
  | 'budgetTotal'
  | 'actualTotal'
  | 'difference'
  | 'differenceRate';

export const MONTH_NAMES = [
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

export const calculationTypeLabels: Record<BudgetTicketCalculationType, string> = {
  calendar_people: 'Personas por calendario',
  manual_tickets: 'Tickets mensuales',
  annual_tickets: 'Tickets anuales',
  manual_amount: 'Importe manual',
};

export const emptyScenarioDraft = (year = new Date().getFullYear()): BudgetScenarioDraft => ({
  name: '',
  year,
  ticketAmount: 0,
  ticketPlanningMode: 'automatic',
  ticketAbsenceRateA: 0.03,
  ticketAbsenceRateB: 0.06,
  ticketExtraPeopleByCalendar: {},
  notes: '',
});
export const emptyManualDraft = (scenarioId: string): BudgetManualItemDraft => ({
  scenarioId,
  concept: '',
  category: '',
  monthlyAmount: 0,
  annualAmount: 0,
  notes: '',
});
export const emptyTicketDraft = (
  scenarioId: string,
  ticketAmount: number,
): BudgetTicketGroupDraft => ({
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
export const emptyActualDraft = (year = new Date().getFullYear()): BudgetActualDraft => ({
  year,
  month: 1,
  block: 'Ticket Restaurante',
  concept: '',
  amount: 0,
  notes: '',
});

export function euro(value: number): string {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

export function percent(value: number): string {
  return value.toLocaleString('es-ES', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export const scenarioExportColumns: ExportColumn<BudgetScenarioExportRow>[] = [
  { key: 'block', header: 'Bloque', value: (row) => row.block },
  { key: 'concept', header: 'Concepto', value: (row) => row.concept },
  { key: 'category', header: 'Categoría / tipo', value: (row) => row.category },
  { key: 'annualTotal', header: 'Total anual', value: (row) => row.annualTotal },
  { key: 'notes', header: 'Notas', value: (row) => row.notes },
];
export const comparisonExportColumns: ExportColumn<BudgetComparisonRow>[] = [
  { key: 'month', header: 'Mes', value: (row) => MONTH_NAMES[row.month - 1] },
  { key: 'scenarioATotal', header: 'Escenario A', value: (row) => row.scenarioATotal },
  { key: 'scenarioBTotal', header: 'Escenario B', value: (row) => row.scenarioBTotal },
  { key: 'difference', header: 'Diferencia €', value: (row) => row.difference },
  { key: 'differenceRate', header: 'Diferencia %', value: (row) => percent(row.differenceRate) },
];
export const actualComparisonExportColumns: ExportColumn<BudgetActualComparisonRow>[] = [
  { key: 'block', header: 'Bloque', value: (row) => row.block },
  { key: 'budgetTotal', header: 'Presupuesto', value: (row) => row.budgetTotal },
  { key: 'actualTotal', header: 'Real', value: (row) => row.actualTotal },
  { key: 'difference', header: 'Desviación €', value: (row) => row.difference },
  { key: 'differenceRate', header: 'Desviación %', value: (row) => percent(row.differenceRate) },
];
