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
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear un escenario nuevo para el año que quieras analizar.',
      'Añadir primero grupos de Ticket Restaurante y después conceptos manuales para completar el presupuesto.',
      'Duplicar escenarios si necesitas probar variantes sin perder el cálculo base.',
      'Revisar comparativas antes de exportar para validar importes, meses y grupos.',
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
