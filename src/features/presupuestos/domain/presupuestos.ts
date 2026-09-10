import {
  countTicketCalendarDays,
  normalizeTicketCalendarName,
  type TicketCalendar,
  type TicketPerson,
} from '../../ticket-restaurante/domain/ticketRestaurante';

export const BUDGET_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const BUDGET_ACTUAL_BLOCKS = [
  'Ticket Restaurante',
  'Formación',
  'Vestuario',
  'Consultoría',
  'Reconocimientos médicos',
  'Gastos sindicales',
  'Otros',
] as const;

export type BudgetMonth = (typeof BUDGET_MONTHS)[number];
export type BudgetActualBlock = (typeof BUDGET_ACTUAL_BLOCKS)[number];
export type BudgetTicketCalculationType =
  | 'calendar_people'
  | 'manual_tickets'
  | 'annual_tickets'
  | 'manual_amount';

export interface BudgetScenario {
  id: string;
  name: string;
  year: number;
  ticketAmount: number;
  ticketPlanningMode?: 'automatic' | 'groups';
  ticketAbsenceRateA?: number;
  ticketAbsenceRateB?: number;
  ticketExtraPeopleByCalendar?: Record<string, number>;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BudgetManualItem {
  id: string;
  scenarioId: string;
  concept: string;
  category: string;
  monthlyAmount: number;
  annualAmount: number;
  notes: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BudgetTicketGroup {
  id: string;
  scenarioId: string;
  name: string;
  peopleCount: number;
  ticketCalendar: string;
  absenceRate: number;
  ticketAmount: number;
  calculationType: BudgetTicketCalculationType;
  manualTickets: number;
  annualTickets: number;
  manualMonthlyAmount: number;
  notes: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface BudgetActual {
  id: string;
  year: number;
  month: number;
  block: BudgetActualBlock;
  concept: string;
  amount: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}


export interface BudgetAutomaticTicketCalendarRow {
  calendarId: string;
  calendarName: string;
  basePeople: number;
  additionalPeople: number;
  totalPeople: number;
  annualDays: number;
  annualTicketsA: number;
  annualTicketsB: number;
  annualAmountA: number;
  annualAmountB: number;
}

export interface BudgetAutomaticTicketPlan {
  year: number;
  rateA: number;
  rateB: number;
  basePeople: number;
  additionalPeople: number;
  totalPeople: number;
  annualTicketsA: number;
  annualTicketsB: number;
  annualAmountA: number;
  annualAmountB: number;
  rows: BudgetAutomaticTicketCalendarRow[];
}

export interface BudgetValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BudgetScenarioMonthlyTotal {
  month: number;
  manualTotal: number;
  ticketTotal: number;
  total: number;
}

export interface BudgetScenarioYearTotal {
  year: number;
  manualTotal: number;
  ticketTotal: number;
  total: number;
  months: BudgetScenarioMonthlyTotal[];
}

export interface BudgetScenarioExportRow {
  block: string;
  concept: string;
  category: string;
  annualTotal: number;
  notes: string;
}

export interface BudgetComparisonRow {
  month: number;
  scenarioATotal: number;
  scenarioBTotal: number;
  difference: number;
  differenceRate: number;
}

export interface BudgetActualComparisonRow {
  block: string;
  budgetTotal: number;
  actualTotal: number;
  difference: number;
  differenceRate: number;
}

export interface BudgetActualDashboardData {
  year: number;
  cutoffMonth: number;
  budgetTotal: number;
  actualTotal: number;
  difference: number;
  differenceRate: number;
  rows: BudgetActualComparisonRow[];
}

export function roundBudgetCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeBudgetNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'string') {
    return 0;
  }
  const normalized = value.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeBudgetRate(value: unknown): number {
  const parsed = normalizeBudgetNumber(
    typeof value === 'string' ? value.replace('%', '') : value,
  );
  if (parsed > 1) {
    return Math.min(parsed / 100, 1);
  }
  return Math.min(Math.max(parsed, 0), 1);
}

export function calculateBudgetManualItemYear(item: Pick<BudgetManualItem, 'monthlyAmount' | 'annualAmount'>): number {
  const annualAmount = normalizeBudgetNumber(item.annualAmount);
  if (annualAmount > 0) {
    return roundBudgetCurrency(annualAmount);
  }
  return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(item.monthlyAmount)) * 12);
}

export function calculateBudgetManualItemMonth(item: Pick<BudgetManualItem, 'monthlyAmount' | 'annualAmount'>): number {
  const annualAmount = normalizeBudgetNumber(item.annualAmount);
  if (annualAmount > 0) {
    return roundBudgetCurrency(annualAmount / 12);
  }
  return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(item.monthlyAmount)));
}

function findBudgetTicketCalendar(calendars: readonly TicketCalendar[], calendarName: string): TicketCalendar | null {
  const normalizedName = normalizeTicketCalendarName(calendarName);
  return calendars.find((calendar) => !calendar.deletedAt && normalizeTicketCalendarName(calendar.nombre) === normalizedName) ?? null;
}

export function calculateBudgetTicketGroupMonth(
  group: BudgetTicketGroup,
  year: number,
  month: number,
  scenarioTicketAmount: number,
  calendars: readonly TicketCalendar[] = [],
): number {
  const ticketAmount = Math.max(0, normalizeBudgetNumber(group.ticketAmount || scenarioTicketAmount));
  if (group.calculationType === 'manual_amount') {
    return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(group.manualMonthlyAmount)));
  }
  if (group.calculationType === 'manual_tickets') {
    return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(group.manualTickets)) * ticketAmount);
  }
  if (group.calculationType === 'annual_tickets') {
    return roundBudgetCurrency((Math.max(0, normalizeBudgetNumber(group.annualTickets)) * ticketAmount) / 12);
  }

  const calendar = findBudgetTicketCalendar(calendars, group.ticketCalendar);
  const ticketDays = calendar ? countTicketCalendarDays(calendar, year, month) : 0;
  const peopleCount = Math.max(0, normalizeBudgetNumber(group.peopleCount));
  const absenceFactor = 1 - normalizeBudgetRate(group.absenceRate);
  return roundBudgetCurrency(ticketDays * peopleCount * absenceFactor * ticketAmount);
}

export function calculateBudgetTicketGroupYear(
  group: BudgetTicketGroup,
  year: number,
  scenarioTicketAmount: number,
  calendars: readonly TicketCalendar[] = [],
): number {
  if (group.calculationType === 'manual_amount') {
    return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(group.manualMonthlyAmount)) * 12);
  }
  if (group.calculationType === 'annual_tickets') {
    const ticketAmount = Math.max(0, normalizeBudgetNumber(group.ticketAmount || scenarioTicketAmount));
    return roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(group.annualTickets)) * ticketAmount);
  }
  return roundBudgetCurrency(
    BUDGET_MONTHS.reduce(
      (total, month) => total + calculateBudgetTicketGroupMonth(group, year, month, scenarioTicketAmount, calendars),
      0,
    ),
  );
}

function visible<T extends { deletedAt?: string | null }>(items: readonly T[]): T[] {
  return items.filter((item) => !item.deletedAt);
}

function scenarioRate(scenario: BudgetScenario, key: 'A' | 'B'): number {
  return normalizeBudgetRate(key === 'A' ? (scenario.ticketAbsenceRateA ?? 0.03) : (scenario.ticketAbsenceRateB ?? 0.06));
}

export function buildAutomaticTicketPlan(
  scenario: BudgetScenario,
  year: number,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetAutomaticTicketPlan {
  const rateA = scenarioRate(scenario, 'A');
  const rateB = scenarioRate(scenario, 'B');
  const ticketAmount = Math.max(0, normalizeBudgetNumber(scenario.ticketAmount));
  const extras = scenario.ticketExtraPeopleByCalendar ?? {};
  const activePeople = people.filter((person) => !person.deletedAt && person.activo);
  const rows = calendars
    .filter((calendar) => !calendar.deletedAt && calendar.activo)
    .map((calendar) => {
      const basePeople = activePeople.filter((person) => person.calendarId === calendar.id).length;
      const additionalPeople = Math.max(0, Math.trunc(normalizeBudgetNumber(extras[calendar.id] ?? 0)));
      const totalPeople = basePeople + additionalPeople;
      const annualDays = BUDGET_MONTHS.reduce((total, month) => total + countTicketCalendarDays(calendar, year, month), 0);
      const theoreticalTickets = annualDays * totalPeople;
      const annualTicketsA = Math.round(theoreticalTickets * (1 - rateA));
      const annualTicketsB = Math.round(theoreticalTickets * (1 - rateB));
      return {
        calendarId: calendar.id,
        calendarName: calendar.nombre,
        basePeople,
        additionalPeople,
        totalPeople,
        annualDays,
        annualTicketsA,
        annualTicketsB,
        annualAmountA: roundBudgetCurrency(annualTicketsA * ticketAmount),
        annualAmountB: roundBudgetCurrency(annualTicketsB * ticketAmount),
      };
    })
    .filter((row) => row.basePeople > 0 || row.additionalPeople > 0);
  return {
    year,
    rateA,
    rateB,
    basePeople: rows.reduce((total, row) => total + row.basePeople, 0),
    additionalPeople: rows.reduce((total, row) => total + row.additionalPeople, 0),
    totalPeople: rows.reduce((total, row) => total + row.totalPeople, 0),
    annualTicketsA: rows.reduce((total, row) => total + row.annualTicketsA, 0),
    annualTicketsB: rows.reduce((total, row) => total + row.annualTicketsB, 0),
    annualAmountA: roundBudgetCurrency(rows.reduce((total, row) => total + row.annualAmountA, 0)),
    annualAmountB: roundBudgetCurrency(rows.reduce((total, row) => total + row.annualAmountB, 0)),
    rows,
  };
}

function calculateAutomaticTicketMonth(
  scenario: BudgetScenario,
  year: number,
  month: number,
  calendars: readonly TicketCalendar[],
  people: readonly TicketPerson[],
  rateKey: 'A' | 'B' = 'A',
): number {
  const rate = scenarioRate(scenario, rateKey);
  const ticketAmount = Math.max(0, normalizeBudgetNumber(scenario.ticketAmount));
  const extras = scenario.ticketExtraPeopleByCalendar ?? {};
  const activePeople = people.filter((person) => !person.deletedAt && person.activo);
  return roundBudgetCurrency(
    calendars
      .filter((calendar) => !calendar.deletedAt && calendar.activo)
      .reduce((total, calendar) => {
        const basePeople = activePeople.filter((person) => person.calendarId === calendar.id).length;
        const additionalPeople = Math.max(0, Math.trunc(normalizeBudgetNumber(extras[calendar.id] ?? 0)));
        const ticketDays = countTicketCalendarDays(calendar, year, month);
        return total + ticketDays * (basePeople + additionalPeople) * (1 - rate) * ticketAmount;
      }, 0),
  );
}

export function calculateBudgetScenarioMonth(
  scenario: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  year: number,
  month: number,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetScenarioMonthlyTotal {
  const scenarioManualItems = visible(manualItems).filter((item) => item.scenarioId === scenario.id);
  const scenarioTicketGroups = visible(ticketGroups).filter((group) => group.scenarioId === scenario.id);
  const manualTotal = roundBudgetCurrency(
    scenarioManualItems.reduce((total, item) => total + calculateBudgetManualItemMonth(item), 0),
  );
  const ticketTotal = scenario.ticketPlanningMode === 'automatic'
    ? calculateAutomaticTicketMonth(scenario, year, month, calendars, people, 'A')
    : roundBudgetCurrency(
        scenarioTicketGroups.reduce(
          (total, group) => total + calculateBudgetTicketGroupMonth(group, year, month, scenario.ticketAmount, calendars),
          0,
        ),
      );
  return { month, manualTotal, ticketTotal, total: roundBudgetCurrency(manualTotal + ticketTotal) };
}

export function calculateBudgetScenarioYear(
  scenario: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  year = scenario.year,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetScenarioYearTotal {
  const months = BUDGET_MONTHS.map((month) => calculateBudgetScenarioMonth(scenario, manualItems, ticketGroups, year, month, calendars, people));
  return {
    year,
    months,
    manualTotal: roundBudgetCurrency(months.reduce((total, month) => total + month.manualTotal, 0)),
    ticketTotal: roundBudgetCurrency(months.reduce((total, month) => total + month.ticketTotal, 0)),
    total: roundBudgetCurrency(months.reduce((total, month) => total + month.total, 0)),
  };
}

export function buildBudgetScenarioExportData(
  scenario: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  year = scenario.year,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetScenarioExportRow[] {
  const manualRows = visible(manualItems)
    .filter((item) => item.scenarioId === scenario.id)
    .map((item) => ({
      block: 'Partidas manuales',
      concept: item.concept,
      category: item.category,
      annualTotal: calculateBudgetManualItemYear(item),
      notes: item.notes,
    }));
  const ticketRows = scenario.ticketPlanningMode === 'automatic'
    ? buildAutomaticTicketPlan(scenario, year, calendars, people).rows.map((row) => ({
        block: 'Ticket Restaurante',
        concept: row.calendarName,
        category: 'Base automática · escenario A',
        annualTotal: row.annualAmountA,
        notes: `${row.basePeople} fijas + ${row.additionalPeople} adicionales · absentismo ${Math.round(scenarioRate(scenario, 'A') * 10000) / 100}%`,
      }))
    : visible(ticketGroups)
        .filter((group) => group.scenarioId === scenario.id)
        .map((group) => ({
          block: 'Ticket Restaurante',
          concept: group.name,
          category: group.calculationType,
          annualTotal: calculateBudgetTicketGroupYear(group, year, scenario.ticketAmount, calendars),
          notes: group.notes,
        }));
  return [...manualRows, ...ticketRows];
}

export function buildBudgetComparisonData(
  scenarioA: BudgetScenario,
  scenarioB: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  year: number,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetComparisonRow[] {
  const totalA = calculateBudgetScenarioYear(scenarioA, manualItems, ticketGroups, year, calendars, people);
  const totalB = calculateBudgetScenarioYear(scenarioB, manualItems, ticketGroups, year, calendars, people);
  return BUDGET_MONTHS.map((month, index) => {
    const scenarioATotal = totalA.months[index]?.total ?? 0;
    const scenarioBTotal = totalB.months[index]?.total ?? 0;
    const difference = roundBudgetCurrency(scenarioBTotal - scenarioATotal);
    return {
      month,
      scenarioATotal,
      scenarioBTotal,
      difference,
      differenceRate: scenarioATotal ? difference / scenarioATotal : 0,
    };
  });
}

export function normalizeBudgetActual(actual: BudgetActual): BudgetActual {
  const block = BUDGET_ACTUAL_BLOCKS.includes(actual.block) ? actual.block : 'Otros';
  return {
    ...actual,
    year: Math.trunc(normalizeBudgetNumber(actual.year)),
    month: Math.min(Math.max(Math.trunc(normalizeBudgetNumber(actual.month)), 1), 12),
    block,
    concept: actual.concept.trim(),
    amount: roundBudgetCurrency(Math.max(0, normalizeBudgetNumber(actual.amount))),
    notes: actual.notes.trim(),
  };
}

export function buildBudgetActualComparisonData(
  scenario: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  actuals: readonly BudgetActual[],
  year: number,
  cutoffMonth: number,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetActualComparisonRow[] {
  const monthLimit = Math.min(Math.max(Math.trunc(cutoffMonth), 1), 12);
  const scenarioTotal = calculateBudgetScenarioYear(scenario, manualItems, ticketGroups, year, calendars, people);
  const manualBudget = roundBudgetCurrency(scenarioTotal.months.slice(0, monthLimit).reduce((total, month) => total + month.manualTotal, 0));
  const ticketBudget = roundBudgetCurrency(scenarioTotal.months.slice(0, monthLimit).reduce((total, month) => total + month.ticketTotal, 0));
  const rowsByBlock = new Map<string, BudgetActualComparisonRow>();
  const seed = (block: string, budgetTotal: number) => rowsByBlock.set(block, { block, budgetTotal, actualTotal: 0, difference: 0, differenceRate: 0 });
  seed('Partidas manuales', manualBudget);
  seed('Ticket Restaurante', ticketBudget);

  visible(actuals)
    .map(normalizeBudgetActual)
    .filter((actual) => actual.year === year && actual.month <= monthLimit)
    .forEach((actual) => {
      const block = actual.block === 'Ticket Restaurante' ? 'Ticket Restaurante' : 'Partidas manuales';
      const row = rowsByBlock.get(block) ?? { block, budgetTotal: 0, actualTotal: 0, difference: 0, differenceRate: 0 };
      row.actualTotal = roundBudgetCurrency(row.actualTotal + actual.amount);
      rowsByBlock.set(block, row);
    });

  return Array.from(rowsByBlock.values()).map((row) => {
    const difference = roundBudgetCurrency(row.budgetTotal - row.actualTotal);
    return { ...row, difference, differenceRate: row.budgetTotal ? difference / row.budgetTotal : 0 };
  });
}

export function buildBudgetActualDashboardData(
  scenario: BudgetScenario,
  manualItems: readonly BudgetManualItem[],
  ticketGroups: readonly BudgetTicketGroup[],
  actuals: readonly BudgetActual[],
  year: number,
  cutoffMonth: number,
  calendars: readonly TicketCalendar[] = [],
  people: readonly TicketPerson[] = [],
): BudgetActualDashboardData {
  const rows = buildBudgetActualComparisonData(scenario, manualItems, ticketGroups, actuals, year, cutoffMonth, calendars, people);
  const budgetTotal = roundBudgetCurrency(rows.reduce((total, row) => total + row.budgetTotal, 0));
  const actualTotal = roundBudgetCurrency(rows.reduce((total, row) => total + row.actualTotal, 0));
  const difference = roundBudgetCurrency(budgetTotal - actualTotal);
  return {
    year,
    cutoffMonth,
    budgetTotal,
    actualTotal,
    difference,
    differenceRate: budgetTotal ? difference / budgetTotal : 0,
    rows,
  };
}

export function validateBudgetScenario(
  scenario: Pick<BudgetScenario, 'name' | 'year' | 'ticketAmount' | 'ticketAbsenceRateA' | 'ticketAbsenceRateB'>,
): BudgetValidationResult {
  const errors: string[] = [];
  if (!scenario.name.trim()) errors.push('El nombre de escenario es obligatorio.');
  if (!Number.isInteger(Number(scenario.year))) errors.push('El año debe ser numérico entero.');
  if (normalizeBudgetNumber(scenario.ticketAmount) < 0) errors.push('El importe ticket no puede ser negativo.');
  const rateA = normalizeBudgetRate(scenario.ticketAbsenceRateA ?? 0.03);
  const rateB = normalizeBudgetRate(scenario.ticketAbsenceRateB ?? 0.06);
  if (rateA < 0 || rateA > 1 || rateB < 0 || rateB > 1) errors.push('Los absentismos deben estar entre 0 % y 100 %.');
  return { valid: errors.length === 0, errors };
}

export function validateBudgetManualItem(item: Pick<BudgetManualItem, 'concept' | 'monthlyAmount' | 'annualAmount'>): BudgetValidationResult {
  const errors: string[] = [];
  const monthlyAmount = normalizeBudgetNumber(item.monthlyAmount);
  const annualAmount = normalizeBudgetNumber(item.annualAmount);
  if (!item.concept.trim()) errors.push('El concepto de partida es obligatorio.');
  if (monthlyAmount <= 0 && annualAmount <= 0) errors.push('Debe existir importe mensual o anual.');
  if (monthlyAmount < 0 || annualAmount < 0) errors.push('Los importes no pueden ser negativos.');
  return { valid: errors.length === 0, errors };
}

export function validateBudgetTicketGroup(group: Pick<BudgetTicketGroup, 'name' | 'calculationType' | 'peopleCount' | 'absenceRate' | 'ticketAmount' | 'manualTickets' | 'annualTickets' | 'manualMonthlyAmount'>): BudgetValidationResult {
  const errors: string[] = [];
  const validTypes: BudgetTicketCalculationType[] = ['calendar_people', 'manual_tickets', 'annual_tickets', 'manual_amount'];
  if (!group.name.trim()) errors.push('El nombre del grupo Ticket es obligatorio.');
  if (!validTypes.includes(group.calculationType)) errors.push('Tipo de cálculo no válido.');
  if (normalizeBudgetNumber(group.peopleCount) < 0) errors.push('Las personas no pueden ser negativas.');
  if (normalizeBudgetNumber(group.ticketAmount) < 0) errors.push('El importe ticket no puede ser negativo.');
  if (normalizeBudgetRate(group.absenceRate) < 0 || normalizeBudgetRate(group.absenceRate) > 1) errors.push('El absentismo debe estar entre 0 y 1.');
  if (normalizeBudgetNumber(group.manualTickets) < 0 || normalizeBudgetNumber(group.annualTickets) < 0) errors.push('Los tickets no pueden ser negativos.');
  if (normalizeBudgetNumber(group.manualMonthlyAmount) < 0) errors.push('El importe manual mensual no puede ser negativo.');
  return { valid: errors.length === 0, errors };
}

export function validateBudgetActual(actual: Pick<BudgetActual, 'year' | 'month' | 'block' | 'concept' | 'amount'>): BudgetValidationResult {
  const errors: string[] = [];
  if (!Number.isInteger(Number(actual.year))) errors.push('El año debe ser entero.');
  if (!Number.isInteger(Number(actual.month)) || Number(actual.month) < 1 || Number(actual.month) > 12) errors.push('El mes debe estar entre 1 y 12.');
  if (!BUDGET_ACTUAL_BLOCKS.includes(actual.block)) errors.push('Bloque no permitido.');
  if (!actual.concept.trim()) errors.push('El concepto es obligatorio.');
  if (normalizeBudgetNumber(actual.amount) < 0) errors.push('El importe no puede ser negativo.');
  return { valid: errors.length === 0, errors };
}
