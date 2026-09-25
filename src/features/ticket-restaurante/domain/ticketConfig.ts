import type {
  TicketAnnualClosure,
  TicketCalculationRules,
  TicketManualDebt,
  TicketManualPerson,
  TicketMonthlySnapshot,
  TicketMonthlySnapshotRow,
  TicketMonthlyWorkflowReview,
  TicketPriceHistoryEntry,
  TicketRestaurantConfig,
  TicketDebtRegularization,
} from './ticketRestauranteTypes';
import { isIsoDate } from './ticketCalendars';
import { normalizeTicketEmployeeNumber } from './ticketPeople';
import { TICKET_RESTAURANT_MIN_ABSENCE_DATE } from './ticketAbsences';
import { roundCurrency, toIsoDate } from './ticketDates';

export const DEFAULT_TICKET_RESTAURANT_CONFIG: TicketRestaurantConfig = {
  importeTicket: 14.57,
  pedidoMensual: 2404407,
  priceHistory: [{ amount: 14.57, effectiveFrom: '2026-03-01' }],
  rules: {
    debtStartDate: '2026-03-01',
    nonDiscountableMotivesByCalendar: { Liberados: ['SIN'] },
  },
  manualDebts: [],
  debtRegularizations: [],
  manualPeople: [],
  workflowReviews: {},
  monthlySnapshots: {},
  annualClosures: {},
};

export function getEffectiveTicketPrice(
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): number {
  const monthStart = toIsoDate(year, month, 1);
  const normalizedHistory = normalizeTicketPriceHistory(config.priceHistory, config.importeTicket);
  const effectiveEntry = normalizedHistory
    .filter((entry) => entry.effectiveFrom <= monthStart)
    .at(-1);

  return effectiveEntry?.amount ?? config.importeTicket;
}

export function normalizeTicketPriceHistory(
  history: readonly TicketPriceHistoryEntry[] | undefined,
  fallbackAmount: number,
): TicketPriceHistoryEntry[] {
  const normalized = (history ?? [])
    .filter(
      (entry) =>
        typeof entry.amount === 'number' &&
        entry.amount >= 0 &&
        typeof entry.effectiveFrom === 'string' &&
        isIsoDate(entry.effectiveFrom),
    )
    .map((entry) => ({ amount: roundCurrency(entry.amount), effectiveFrom: entry.effectiveFrom }))
    .sort((first, second) => first.effectiveFrom.localeCompare(second.effectiveFrom));

  if (normalized.length > 0) {
    return normalized;
  }

  return [
    {
      amount: roundCurrency(fallbackAmount),
      effectiveFrom: DEFAULT_TICKET_RESTAURANT_CONFIG.priceHistory[0].effectiveFrom,
    },
  ];
}

export function normalizeTicketCalculationRules(
  rules: Partial<TicketCalculationRules> | undefined,
): TicketCalculationRules {
  const defaultRules = DEFAULT_TICKET_RESTAURANT_CONFIG.rules;
  // El módulo excluye por diseño las ausencias que empiezan antes de
  // TICKET_RESTAURANT_MIN_ABSENCE_DATE (constante). Un debtStartDate anterior
  // a esa fecha prometería una deuda que el filtro de ausencias nunca podría
  // alimentar, así que se acota aquí al mínimo del módulo.
  const rawDebtStartDate =
    typeof rules?.debtStartDate === 'string' && isIsoDate(rules.debtStartDate)
      ? rules.debtStartDate
      : defaultRules.debtStartDate;

  return {
    debtStartDate:
      rawDebtStartDate < TICKET_RESTAURANT_MIN_ABSENCE_DATE
        ? TICKET_RESTAURANT_MIN_ABSENCE_DATE
        : rawDebtStartDate,
    nonDiscountableMotivesByCalendar:
      rules?.nonDiscountableMotivesByCalendar &&
      typeof rules.nonDiscountableMotivesByCalendar === 'object'
        ? Object.fromEntries(
            Object.entries(rules.nonDiscountableMotivesByCalendar).map(([calendar, motives]) => [
              calendar.trim(),
              Array.isArray(motives)
                ? motives.map((motivo) => String(motivo).trim()).filter(Boolean)
                : [],
            ]),
          )
        : defaultRules.nonDiscountableMotivesByCalendar,
  };
}

function normalizeManualDebts(value: unknown): TicketManualDebt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<TicketManualDebt>;
    if (
      typeof item.id !== 'string' ||
      typeof item.empleado !== 'string' ||
      typeof item.totalTickets !== 'number' ||
      typeof item.originYear !== 'number' ||
      typeof item.originMonth !== 'number' ||
      typeof item.startYear !== 'number' ||
      typeof item.startMonth !== 'number' ||
      typeof item.months !== 'number' ||
      typeof item.reason !== 'string'
    ) return [];
    return [{
      id: item.id,
      empleado: normalizeTicketEmployeeNumber(item.empleado),
      nombreApellidos: typeof item.nombreApellidos === 'string' ? item.nombreApellidos.trim() : '',
      totalTickets: Math.max(1, Math.trunc(item.totalTickets)),
      originYear: Math.trunc(item.originYear),
      originMonth: Math.min(12, Math.max(1, Math.trunc(item.originMonth))),
      startYear: Math.trunc(item.startYear),
      startMonth: Math.min(12, Math.max(1, Math.trunc(item.startMonth))),
      months: Math.min(
        Math.max(1, Math.trunc(item.totalTickets)),
        Math.max(1, Math.trunc(item.months)),
      ),
      reason: item.reason.trim(),
      observations: typeof item.observations === 'string' ? item.observations.trim() : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
      cancelledAt: typeof item.cancelledAt === 'string' ? item.cancelledAt : null,
      cancellationReason: typeof item.cancellationReason === 'string' ? item.cancellationReason.trim() : '',
    }];
  });
}

function normalizeDebtRegularizations(value: unknown): TicketDebtRegularization[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<TicketDebtRegularization>;
    if (
      typeof item.id !== 'string' ||
      typeof item.empleado !== 'string' ||
      typeof item.year !== 'number' ||
      typeof item.month !== 'number' ||
      typeof item.calculatedTickets !== 'number' ||
      typeof item.targetTickets !== 'number' ||
      typeof item.reason !== 'string'
    ) return [];
    return [{
      id: item.id,
      empleado: normalizeTicketEmployeeNumber(item.empleado),
      nombreApellidos: typeof item.nombreApellidos === 'string' ? item.nombreApellidos.trim() : '',
      year: Math.trunc(item.year),
      month: Math.min(12, Math.max(1, Math.trunc(item.month))),
      calculatedTickets: Math.max(0, Math.trunc(item.calculatedTickets)),
      targetTickets: Math.max(0, Math.trunc(item.targetTickets)),
      reason: item.reason.trim(),
      observations: typeof item.observations === 'string' ? item.observations.trim() : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    }];
  });
}

function normalizeManualPeople(value: unknown): TicketManualPerson[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Partial<TicketManualPerson>;
    if (typeof item.id !== 'string' || typeof item.empleado !== 'string' || typeof item.nombreApellidos !== 'string') return [];
    const monthlyTickets = item.monthlyTickets && typeof item.monthlyTickets === 'object'
      ? Object.fromEntries(Object.entries(item.monthlyTickets).flatMap(([key, value]) =>
          /^\d{4}-\d{2}$/.test(key) && typeof value === 'number' && Number.isFinite(value)
            ? [[key, Math.max(0, Math.trunc(value))]]
            : [],
        ))
      : {};
    return [{
      id: item.id,
      empleado: normalizeTicketEmployeeNumber(item.empleado),
      nombreApellidos: item.nombreApellidos.trim(),
      dni: typeof item.dni === 'string' ? item.dni.trim() : '',
      activo: item.activo !== false,
      includeContribution: item.includeContribution === true,
      area: typeof item.area === 'string' ? item.area.trim() : '',
      monthlyTickets,
      inactiveFromMonth:
        typeof item.inactiveFromMonth === 'string' && /^\d{4}-\d{2}$/.test(item.inactiveFromMonth)
          ? item.inactiveFromMonth
          : undefined,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    }];
  });
}

function normalizeMonthlySnapshots(
  snapshots: TicketRestaurantConfig['monthlySnapshots'],
): Record<string, TicketMonthlySnapshot> {
  if (!snapshots || typeof snapshots !== 'object') return {};
  const normalized: Record<string, TicketMonthlySnapshot> = {};
  Object.entries(snapshots).forEach(([key, raw]) => {
    if (!/^\d{4}-\d{2}$/.test(key) || !raw || typeof raw !== 'object') return;
    const year = Number(key.slice(0, 4));
    const month = Number(key.slice(5, 7));
    if (!Number.isInteger(year) || month < 1 || month > 12 || !Array.isArray(raw.rows)) return;
    const rows = raw.rows.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const row = item as Partial<TicketMonthlySnapshotRow>;
      if (typeof row.empleado !== 'string' || typeof row.nombreApellidos !== 'string') return [];
      return [{
        empleado: normalizeTicketEmployeeNumber(row.empleado),
        nombreApellidos: row.nombreApellidos.trim(),
        area: typeof row.area === 'string' && row.area.trim() ? row.area.trim() : 'Sin área',
        tickets: typeof row.tickets === 'number' && Number.isFinite(row.tickets) ? Math.max(0, Math.trunc(row.tickets)) : 0,
        importe: typeof row.importe === 'number' && Number.isFinite(row.importe) ? roundCurrency(Math.max(0, row.importe)) : 0,
        manual: row.manual === true,
      }];
    });
    normalized[key] = {
      year,
      month,
      closedAt: typeof raw.closedAt === 'string' ? raw.closedAt : '',
      rows,
    };
  });
  return normalized;
}

function normalizeAnnualClosures(
  closures: TicketRestaurantConfig['annualClosures'],
): Record<string, TicketAnnualClosure> {
  if (!closures || typeof closures !== 'object') return {};
  const normalized: Record<string, TicketAnnualClosure> = {};
  Object.entries(closures).forEach(([key, raw]) => {
    if (!/^\d{4}$/.test(key) || !raw || typeof raw !== 'object') return;
    const year = Number(key);
    const candidate = raw as Partial<TicketAnnualClosure>;
    if (!Number.isInteger(year)) return;
    normalized[key] = {
      year,
      closedAt: typeof candidate.closedAt === 'string' ? candidate.closedAt : '',
    };
  });
  return normalized;
}

function normalizeWorkflowReviews(
  reviews: TicketRestaurantConfig['workflowReviews'],
): Record<string, TicketMonthlyWorkflowReview> {
  if (!reviews || typeof reviews !== 'object') return {};

  const normalized: Record<string, TicketMonthlyWorkflowReview> = {};
  Object.entries(reviews).forEach(([key, value]) => {
    if (!/^\d{4}-\d{2}$/.test(key) || !value || typeof value !== 'object') return;
    normalized[key] = {
      absencesReviewed: value.absencesReviewed === true,
      manutencionesReviewed: value.manutencionesReviewed === true,
      manualDebtsReviewed: value.manualDebtsReviewed === true,
    };
  });
  return normalized;
}

export function ticketWorkflowMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getTicketMonthlyWorkflowReview(
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketMonthlyWorkflowReview {
  return normalizeWorkflowReviews(config.workflowReviews)[ticketWorkflowMonthKey(year, month)] ?? {
    absencesReviewed: false,
    manutencionesReviewed: false,
    manualDebtsReviewed: false,
  };
}

export function normalizeTicketRestaurantConfig(
  config: TicketRestaurantConfig,
): TicketRestaurantConfig {
  const importeTicket =
    typeof config.importeTicket === 'number' && config.importeTicket >= 0
      ? roundCurrency(config.importeTicket)
      : DEFAULT_TICKET_RESTAURANT_CONFIG.importeTicket;
  const priceHistory = normalizeTicketPriceHistory(config.priceHistory, importeTicket);
  const latestPrice = priceHistory.at(-1)?.amount ?? importeTicket;

  return {
    importeTicket: latestPrice,
    pedidoMensual:
      typeof config.pedidoMensual === 'number' && config.pedidoMensual >= 0
        ? config.pedidoMensual
        : DEFAULT_TICKET_RESTAURANT_CONFIG.pedidoMensual,
    priceHistory,
    rules: normalizeTicketCalculationRules(config.rules),
    manualDebts: normalizeManualDebts(config.manualDebts),
    debtRegularizations: normalizeDebtRegularizations(config.debtRegularizations),
    manualPeople: normalizeManualPeople(config.manualPeople),
    workflowReviews: normalizeWorkflowReviews(config.workflowReviews),
    monthlySnapshots: normalizeMonthlySnapshots(config.monthlySnapshots),
    annualClosures: normalizeAnnualClosures(config.annualClosures),
  };
}
