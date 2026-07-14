export interface TicketCalendar {
  id: string;
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
  ticketIsoWeekdays: number[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketCalendarDraft {
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
  ticketIsoWeekdays?: number[];
}

export interface TicketRestaurantAbsence {
  id: string;
  empleado: string;
  nombreApellidos: string;
  desde: string;
  hasta: string;
  motivo: string;
  totalDias: number;
  afectaTicket: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketRestaurantAbsenceDraft {
  empleado: string;
  nombreApellidos: string;
  desde: string;
  hasta: string;
  motivo: string;
  totalDias: number;
  afectaTicket: boolean;
}

export interface TicketManutencionImpact {
  id: string;
  empleado: string;
  nombreApellidos: string;
  fechaGasto: string;
  afectaTicket: boolean;
  imputacionYear: number;
  imputacionMonth: number;
  deletedAt: string | null;
}

export interface TicketPerson {
  empleado: string;
  nombre: string;
  apellido1: string;
  apellido2: string;
  dni: string;
  nombreApellidos: string;
  puesto: string;
  calendarId: string;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketPersonDraft {
  empleado: string;
  nombre: string;
  apellido1: string;
  apellido2: string;
  dni: string;
  nombreApellidos: string;
  puesto: string;
  calendarId: string;
  activo: boolean;
}

export interface TicketPersonDraftInput {
  empleado: string;
  nombre?: string;
  apellido1?: string;
  apellido2?: string;
  dni?: string;
  nombreApellidos?: string;
  puesto: string;
  calendarId: string;
  activo: boolean;
}

export interface TicketPriceHistoryEntry {
  amount: number;
  effectiveFrom: string;
}

export interface TicketCalculationRules {
  debtStartDate: string;
  nonDiscountableMotivesByCalendar: Record<string, string[]>;
  applyDebtAtClosedMonth: boolean;
}

export interface TicketRestaurantConfig {
  importeTicket: number;
  pedidoMensual: number;
  priceHistory: TicketPriceHistoryEntry[];
  rules: TicketCalculationRules;
}

export interface TicketDebtDetailDay {
  id: string;
  fecha: string;
  motivo: string;
  mesOrigen: string;
}

export interface TicketManutencionDetailDay {
  id: string;
  fecha: string;
}

export interface TicketPersonCalculation {
  empleado: string;
  nombre: string;
  apellido1: string;
  apellido2: string;
  dni: string;
  nombreApellidos: string;
  puesto: string;
  calendario: string;
  diasTeoricos: number;
  diasSinTicket: number;
  ausenciasMes: number;
  hojasGastoMes: number;
  deudaEntrante: number;
  ausenciasAplicadas: number;
  deudaPendiente: number;
  ticketsFinales: number;
  importe: number;
  ausenciaIds: string[];
  ausenciaDiasDescontados: Record<string, number>;
  deudaAplicadaDetalle: TicketDebtDetailDay[];
  deudaPendienteDetalle: TicketDebtDetailDay[];
  hojaGastoDetalle: TicketManutencionDetailDay[];
}

export interface TicketMonthCalculation {
  year: number;
  month: number;
  rows: TicketPersonCalculation[];
  totals: {
    personas: number;
    diasTeoricos: number;
    diasSinTicket: number;
    ausenciasMes: number;
    hojasGastoMes: number;
    deudaEntrante: number;
    ausenciasAplicadas: number;
    deudaPendiente: number;
    ticketsFinales: number;
    importe: number;
  };
}

export const TICKET_RESTAURANT_MIN_ABSENCE_DATE = '2026-03-01';

export const DEFAULT_TICKET_RESTAURANT_CONFIG: TicketRestaurantConfig = {
  importeTicket: 14.57,
  pedidoMensual: 2404407,
  priceHistory: [{ amount: 14.57, effectiveFrom: '2026-03-01' }],
  rules: {
    debtStartDate: '2026-03-01',
    nonDiscountableMotivesByCalendar: { Liberados: ['SIN'] },
    applyDebtAtClosedMonth: true,
  },
};

export const EMPTY_TICKET_PERSON_DRAFT: TicketPersonDraft = {
  empleado: '',
  nombre: '',
  apellido1: '',
  apellido2: '',
  dni: '',
  nombreApellidos: '',
  puesto: '',
  calendarId: '',
  activo: true,
};

export interface CalendarDay {
  fecha: string;
  diaMes: number;
  diaSemana: number;
  esFinDeSemana: boolean;
  sinTicket: boolean;
}

export interface CalendarMonth {
  mes: number;
  nombre: string;
  blancosIniciales: number;
  dias: CalendarDay[];
}

export const EMPTY_TICKET_CALENDAR_DRAFT: TicketCalendarDraft = {
  nombre: '',
  activo: true,
  diasSinTicket: [],
  ticketIsoWeekdays: [1, 2, 3, 4, 5],
};

const CANONICAL_TICKET_CALENDAR_NAMES: Record<string, string> = {
  sscc: 'sscc',
  servicioscentrales: 'sscc',
  'servicios centrales': 'sscc',
  ariz: 'ingenieria ariz',
  ingenieriaariz: 'ingenieria ariz',
  'ingenieria ariz': 'ingenieria ariz',
  'ingeniería ariz': 'ingenieria ariz',
  sopela: 'instalaciones sopela',
  instalacionessopela: 'instalaciones sopela',
  'instalaciones sopela': 'instalaciones sopela',
  liberados: 'liberados',
  liberado: 'liberados',
};

export function normalizeTicketCalendarName(value: string): string {
  const normalized = normalizePlainText(value);
  return (
    CANONICAL_TICKET_CALENDAR_NAMES[normalized.replace(/\s+/g, '')] ??
    CANONICAL_TICKET_CALENDAR_NAMES[normalized] ??
    normalized
  );
}

const MONTH_NAMES = [
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

export function normalizeDiasSinTicket(fechas: string[]): string[] {
  return Array.from(
    new Set(fechas.map((fecha) => fecha.trim()).filter((fecha) => isIsoDate(fecha))),
  ).sort((first, second) => first.localeCompare(second));
}

export function normalizeTicketIsoWeekdays(days: readonly number[] | undefined): number[] {
  const normalized = Array.from(
    new Set(
      (days ?? [1, 2, 3, 4, 5])
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 5),
    ),
  ).sort((first, second) => first - second);

  return normalized.length ? normalized : [1, 2, 3, 4, 5];
}

export function buildTicketCalendar(
  draft: TicketCalendarDraft,
  now: string,
  id: string,
  previous?: TicketCalendar,
): TicketCalendar {
  return {
    id,
    nombre: draft.nombre.trim(),
    activo: draft.activo,
    diasSinTicket: normalizeDiasSinTicket(draft.diasSinTicket),
    ticketIsoWeekdays: normalizeTicketIsoWeekdays(
      draft.ticketIsoWeekdays ?? previous?.ticketIsoWeekdays,
    ),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketCalendars(calendars: TicketCalendar[]): TicketCalendar[] {
  return calendars.filter((calendar) => !calendar.deletedAt);
}

export function toggleDiaSinTicket(calendar: TicketCalendar, fecha: string): TicketCalendar {
  if (!isIsoDate(fecha)) {
    return calendar;
  }

  const actuales = new Set(calendar.diasSinTicket);
  if (actuales.has(fecha)) {
    actuales.delete(fecha);
  } else {
    actuales.add(fecha);
  }

  return {
    ...calendar,
    diasSinTicket: normalizeDiasSinTicket(Array.from(actuales)),
  };
}

export function normalizeTicketEmployeeNumber(value: unknown): string {
  const trimmed = String(value ?? '')
    .trim()
    .replace(/\.0$/, '');
  if (!/^\d+$/.test(trimmed)) return trimmed;
  return trimmed.replace(/^0+(?=\d)/, '');
}

function sameTicketEmployee(first: string | undefined, second: string | undefined): boolean {
  return normalizeTicketEmployeeNumber(first) === normalizeTicketEmployeeNumber(second);
}

function cleanTicketPersonText(value: string | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function buildTicketPersonFullName(
  draft: Pick<TicketPersonDraftInput, 'nombre' | 'apellido1' | 'apellido2' | 'nombreApellidos'>,
): string {
  const partsName = [draft.nombre, draft.apellido1, draft.apellido2]
    .map(cleanTicketPersonText)
    .filter(Boolean)
    .join(' ');

  return partsName || cleanTicketPersonText(draft.nombreApellidos);
}

export function splitTicketPersonFullName(
  nombreApellidos: string,
): Pick<TicketPersonDraft, 'nombre' | 'apellido1' | 'apellido2'> {
  const parts = cleanTicketPersonText(nombreApellidos).split(' ').filter(Boolean);
  if (parts.length <= 1) {
    return { nombre: parts.join(' '), apellido1: '', apellido2: '' };
  }

  if (parts.length === 2) {
    return { nombre: parts[0] ?? '', apellido1: parts[1] ?? '', apellido2: '' };
  }

  return {
    nombre: parts.slice(0, -2).join(' '),
    apellido1: parts.at(-2) ?? '',
    apellido2: parts.at(-1) ?? '',
  };
}

export function buildTicketPerson(
  draft: TicketPersonDraftInput,
  now: string,
  previous?: TicketPerson,
): TicketPerson {
  const nombre = cleanTicketPersonText(draft.nombre);
  const apellido1 = cleanTicketPersonText(draft.apellido1);
  const apellido2 = cleanTicketPersonText(draft.apellido2);
  const nombreApellidos = buildTicketPersonFullName({
    ...draft,
    nombre,
    apellido1,
    apellido2,
  });

  return {
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
    nombre,
    apellido1,
    apellido2,
    dni: cleanTicketPersonText(draft.dni),
    nombreApellidos,
    puesto: cleanTicketPersonText(draft.puesto),
    calendarId: draft.calendarId,
    activo: draft.activo,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function visibleTicketPeople(people: TicketPerson[]): TicketPerson[] {
  return people.filter((person) => !person.deletedAt);
}

export function calculateMonthlyTicketOrder(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  manutenciones: readonly TicketManutencionImpact[] = [],
): TicketMonthCalculation {
  return calculateTicketMonthInternal(
    people,
    calendars,
    absences,
    config,
    year,
    month,
    'monthlyOrderWithDebt',
    manutenciones,
  );
}

export function calculateTicketContribution(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  manutenciones: readonly TicketManutencionImpact[] = [],
): TicketMonthCalculation {
  return calculateTicketMonthInternal(
    people,
    calendars,
    absences,
    config,
    year,
    month,
    'monthlyContribution',
    manutenciones,
  );
}

export function calculateTicketMonth(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketMonthCalculation {
  return calculateMonthlyTicketOrder(people, calendars, absences, config, year, month);
}

type TicketCalculationMode = 'monthlyOrderWithDebt' | 'monthlyContribution';

export interface TicketAbsenceMonthImpact {
  calendario: string;
  diasTicketMes: number;
  descuentaTicket: boolean;
}

export function calculateTicketAbsenceMonthImpact(
  absence: TicketRestaurantAbsence,
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketAbsenceMonthImpact {
  const person = people.find(
    (item) => !item.deletedAt && item.activo && sameTicketEmployee(item.empleado, absence.empleado),
  );
  const calendar = person
    ? calendars.find((item) => !item.deletedAt && item.activo && item.id === person.calendarId)
    : undefined;

  if (
    !person ||
    !calendar ||
    !absence.afectaTicket ||
    absence.desde < TICKET_RESTAURANT_MIN_ABSENCE_DATE
  ) {
    return {
      calendario: calendar?.nombre ?? 'Sin calendario',
      diasTicketMes: 0,
      descuentaTicket: false,
    };
  }

  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  if (absence.desde > monthEnd || absence.hasta < monthStart) {
    return { calendario: calendar.nombre, diasTicketMes: 0, descuentaTicket: false };
  }

  const descuentaTicket = !absenceIsNonDiscountableByCalendar(absence, calendar, config.rules);
  if (!descuentaTicket) {
    return { calendario: calendar.nombre, diasTicketMes: 0, descuentaTicket: false };
  }

  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  let diasTicketMes = 0;
  forEachIsoDate(
    maxIsoDate(absence.desde, monthStart),
    minIsoDate(absence.hasta, monthEnd),
    (fecha) => {
      if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
        diasTicketMes += 1;
      }
    },
  );

  return { calendario: calendar.nombre, diasTicketMes, descuentaTicket: diasTicketMes > 0 };
}

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

  return {
    debtStartDate:
      typeof rules?.debtStartDate === 'string' && isIsoDate(rules.debtStartDate)
        ? rules.debtStartDate
        : defaultRules.debtStartDate,
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
    applyDebtAtClosedMonth: true,
  };
}

function compareTicketCalculationRowsByEmployee(
  first: TicketPersonCalculation,
  second: TicketPersonCalculation,
): number {
  const employeeComparison = first.empleado.localeCompare(second.empleado, 'es', {
    numeric: true,
    sensitivity: 'base',
  });

  if (employeeComparison !== 0) {
    return employeeComparison;
  }

  return first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
    numeric: true,
    sensitivity: 'base',
  });
}

function calculateTicketMonthInternal(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  mode: TicketCalculationMode,
  manutenciones: readonly TicketManutencionImpact[] = [],
): TicketMonthCalculation {
  const effectiveConfig = normalizeTicketRestaurantConfig(config);
  const calendarById = new Map(
    calendars
      .filter((calendar) => !calendar.deletedAt && calendar.activo)
      .map((calendar) => [calendar.id, calendar]),
  );

  const rows = people
    .filter((person) => !person.deletedAt && person.activo)
    .map((person) => {
      const calendar = calendarById.get(person.calendarId);
      return mode === 'monthlyOrderWithDebt'
        ? calculatePersonMonthlyOrderWithDebt(
            person,
            calendar,
            absences,
            effectiveConfig,
            year,
            month,
            manutenciones,
          )
        : calculatePersonMonthlyContribution(
            person,
            calendar,
            absences,
            effectiveConfig,
            year,
            month,
            manutenciones,
          );
    })
    .sort(compareTicketCalculationRowsByEmployee);

  return {
    year,
    month,
    rows,
    totals: rows.reduce(
      (totals, row) => ({
        personas: totals.personas + 1,
        diasTeoricos: totals.diasTeoricos + row.diasTeoricos,
        diasSinTicket: totals.diasSinTicket + row.diasSinTicket,
        ausenciasMes: totals.ausenciasMes + row.ausenciasMes,
        hojasGastoMes: totals.hojasGastoMes + row.hojasGastoMes,
        deudaEntrante: totals.deudaEntrante + row.deudaEntrante,
        ausenciasAplicadas: totals.ausenciasAplicadas + row.ausenciasAplicadas,
        deudaPendiente: totals.deudaPendiente + row.deudaPendiente,
        ticketsFinales: totals.ticketsFinales + row.ticketsFinales,
        importe: roundCurrency(totals.importe + row.importe),
      }),
      {
        personas: 0,
        diasTeoricos: 0,
        diasSinTicket: 0,
        ausenciasMes: 0,
        hojasGastoMes: 0,
        deudaEntrante: 0,
        ausenciasAplicadas: 0,
        deudaPendiente: 0,
        ticketsFinales: 0,
        importe: 0,
      },
    ),
  };
}

function calculatePersonMonthlyContribution(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  manutenciones: readonly TicketManutencionImpact[] = [],
): TicketPersonCalculation {
  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
  const ticketDays = calendar ? buildMonthTicketDays(calendar, year, month) : [];
  const absenceDays = calendar
    ? buildPersonAbsenceTicketDays(person, calendar, absences, monthStart, monthEnd, config.rules)
    : new Set<string>();
  const manutencionDays = calendar
    ? buildPersonManutencionTicketDays(person, calendar, manutenciones, year, month)
    : new Set<string>();
  const effectivePrice = getEffectiveTicketPrice(config, year, month);
  const ticketsFinales = Math.max(0, ticketDays.length - absenceDays.size);

  return {
    empleado: person.empleado,
    nombre: person.nombre,
    apellido1: person.apellido1,
    apellido2: person.apellido2,
    dni: person.dni,
    nombreApellidos: person.nombreApellidos,
    puesto: person.puesto,
    calendario: calendar?.nombre ?? 'Sin calendario',
    diasTeoricos: ticketDays.length,
    diasSinTicket: calendar ? countMonthNoTicketDays(calendar, year, month) : 0,
    ausenciasMes: absenceDays.size,
    hojasGastoMes: manutencionDays.size,
    deudaEntrante: 0,
    ausenciasAplicadas: absenceDays.size,
    deudaPendiente: 0,
    ticketsFinales,
    importe: roundCurrency(ticketsFinales * effectivePrice),
    ausenciaIds: [
      ...getAppliedAbsenceIdsForTicketDays(
        person,
        calendar,
        absences,
        monthStart,
        monthEnd,
        config.rules,
      ),
    ],
    ausenciaDiasDescontados: {
      ...getAppliedAbsenceDiscountedDaysById(
        person,
        calendar,
        absences,
        monthStart,
        monthEnd,
        config.rules,
      ),
    },
    deudaAplicadaDetalle: calendar
      ? buildPersonAbsenceTicketDayDetails(
          person,
          calendar,
          absences,
          monthStart,
          monthEnd,
          config.rules,
        )
      : [],
    deudaPendienteDetalle: [],
    hojaGastoDetalle: calendar
      ? buildPersonManutencionTicketDayDetails(person, calendar, manutenciones, year, month)
      : [],
  };
}

function calculatePersonMonthlyOrderWithDebt(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
  manutenciones: readonly TicketManutencionImpact[] = [],
): TicketPersonCalculation {
  const ticketDays = calendar ? buildMonthTicketDays(calendar, year, month) : [];
  const effectivePrice = getEffectiveTicketPrice(config, year, month);
  const debtStatus = calendar
    ? calculatePersonMonthlyDiscountStatus(
        person,
        calendar,
        absences,
        manutenciones,
        config,
        year,
        month,
      )
    : emptyMonthlyOrderDebtStatus();
  const ticketsFinales = Math.max(0, ticketDays.length - debtStatus.ausenciasAplicadas);

  return {
    empleado: person.empleado,
    nombre: person.nombre,
    apellido1: person.apellido1,
    apellido2: person.apellido2,
    dni: person.dni,
    nombreApellidos: person.nombreApellidos,
    puesto: person.puesto,
    calendario: calendar?.nombre ?? 'Sin calendario',
    diasTeoricos: ticketDays.length,
    diasSinTicket: calendar ? countMonthNoTicketDays(calendar, year, month) : 0,
    ausenciasMes: 0,
    hojasGastoMes: debtStatus.hojasGastoAplicadas,
    deudaEntrante: debtStatus.deudaEntrante,
    ausenciasAplicadas: debtStatus.ausenciasAplicadas,
    deudaPendiente: debtStatus.deudaPendiente,
    ticketsFinales,
    importe: roundCurrency(ticketsFinales * effectivePrice),
    ausenciaIds: debtStatus.ausenciaIds,
    ausenciaDiasDescontados: debtStatus.ausenciaDiasDescontados,
    deudaAplicadaDetalle: debtStatus.deudaAplicadaDetalle,
    deudaPendienteDetalle: debtStatus.deudaPendienteDetalle,
    hojaGastoDetalle: debtStatus.hojaGastoDetalle,
  };
}

interface PendingMonthlyDiscount extends TicketDebtDetailDay {
  kind: 'absence' | 'manutencion';
}

interface MonthlyOrderDebtStatus {
  deudaEntrante: number;
  ausenciasAplicadas: number;
  hojasGastoAplicadas: number;
  deudaPendiente: number;
  ausenciaIds: string[];
  ausenciaDiasDescontados: Record<string, number>;
  deudaAplicadaDetalle: TicketDebtDetailDay[];
  deudaPendienteDetalle: TicketDebtDetailDay[];
  hojaGastoDetalle: TicketManutencionDetailDay[];
}

function calculatePersonMonthlyDiscountStatus(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  manutenciones: readonly TicketManutencionImpact[],
  config: TicketRestaurantConfig,
  targetYear: number,
  targetMonth: number,
): MonthlyOrderDebtStatus {
  const targetMonthStart = toIsoDate(targetYear, targetMonth, 1);
  const debtStartDate = config.rules.debtStartDate;
  const debtStart = parseIsoYearMonth(debtStartDate);
  const firstContribution = addMonths(debtStart.year, debtStart.month, 1);
  const firstContributionMonthStart = toIsoDate(firstContribution.year, firstContribution.month, 1);
  if (targetMonthStart < firstContributionMonthStart) {
    return emptyMonthlyOrderDebtStatus();
  }

  const pendingDiscounts: PendingMonthlyDiscount[] = [];
  let cursorYear = firstContribution.year;
  let cursorMonth = firstContribution.month;

  while (toIsoDate(cursorYear, cursorMonth, 1) <= targetMonthStart) {
    const previousMonth = addMonths(cursorYear, cursorMonth, -1);
    const previousMonthStart = toIsoDate(previousMonth.year, previousMonth.month, 1);
    const previousMonthEnd = toIsoDate(
      previousMonth.year,
      previousMonth.month,
      new Date(Date.UTC(previousMonth.year, previousMonth.month, 0)).getUTCDate(),
    );

    pendingDiscounts.push(
      ...buildPersonAbsenceTicketDayDetails(
        person,
        calendar,
        absences,
        maxIsoDate(previousMonthStart, debtStartDate),
        previousMonthEnd,
        config.rules,
      ).map((detail): PendingMonthlyDiscount => ({ ...detail, kind: 'absence' })),
    );

    const deudaEntrante = pendingDiscounts.length;
    pendingDiscounts.push(
      ...buildPersonManutencionDiscountDetails(
        person,
        calendar,
        manutenciones,
        cursorYear,
        cursorMonth,
      ),
    );

    const availableTickets = buildMonthTicketDays(calendar, cursorYear, cursorMonth).length;
    const appliedCount = Math.min(availableTickets, pendingDiscounts.length);
    const appliedDiscounts = pendingDiscounts.splice(0, appliedCount);

    if (cursorYear === targetYear && cursorMonth === targetMonth) {
      const discountedDaysById = new Map<string, number>();
      appliedDiscounts.forEach((detail) => {
        discountedDaysById.set(detail.id, (discountedDaysById.get(detail.id) ?? 0) + 1);
      });
      const appliedManutenciones = appliedDiscounts.filter(
        (detail) => detail.kind === 'manutencion',
      );

      return {
        deudaEntrante,
        ausenciasAplicadas: appliedDiscounts.length,
        hojasGastoAplicadas: appliedManutenciones.length,
        deudaPendiente: pendingDiscounts.length,
        ausenciaIds: Array.from(new Set(appliedDiscounts.map((detail) => detail.id))),
        ausenciaDiasDescontados: Object.fromEntries(discountedDaysById),
        deudaAplicadaDetalle: appliedDiscounts.map(stripPendingDiscountKind),
        deudaPendienteDetalle: pendingDiscounts.map(stripPendingDiscountKind),
        hojaGastoDetalle: appliedManutenciones.map((detail) => ({
          id: detail.id,
          fecha: detail.fecha,
        })),
      };
    }

    const nextMonth = addMonths(cursorYear, cursorMonth, 1);
    cursorYear = nextMonth.year;
    cursorMonth = nextMonth.month;
  }

  return emptyMonthlyOrderDebtStatus();
}

function buildPersonManutencionDiscountDetails(
  person: TicketPerson,
  calendar: TicketCalendar,
  manutenciones: readonly TicketManutencionImpact[],
  year: number,
  month: number,
): PendingMonthlyDiscount[] {
  return buildPersonManutencionTicketDayDetails(person, calendar, manutenciones, year, month).map(
    (detail) => ({
      ...detail,
      motivo: 'Hoja de gasto',
      mesOrigen: `${year}-${String(month).padStart(2, '0')}`,
      kind: 'manutencion' as const,
    }),
  );
}

function stripPendingDiscountKind(detail: PendingMonthlyDiscount): TicketDebtDetailDay {
  return {
    id: detail.id,
    fecha: detail.fecha,
    motivo: detail.motivo,
    mesOrigen: detail.mesOrigen,
  };
}

function emptyMonthlyOrderDebtStatus(): MonthlyOrderDebtStatus {
  return {
    deudaEntrante: 0,
    ausenciasAplicadas: 0,
    hojasGastoAplicadas: 0,
    deudaPendiente: 0,
    ausenciaIds: [],
    ausenciaDiasDescontados: {},
    deudaAplicadaDetalle: [],
    deudaPendienteDetalle: [],
    hojaGastoDetalle: [],
  };
}

function parseIsoYearMonth(fecha: string): { year: number; month: number } {
  return { year: Number(fecha.slice(0, 4)), month: Number(fecha.slice(5, 7)) };
}

function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

function buildPersonManutencionTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar,
  manutenciones: readonly TicketManutencionImpact[],
  year: number,
  month: number,
): Set<string> {
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  return new Set(
    manutenciones
      .filter(
        (row) =>
          !row.deletedAt &&
          row.afectaTicket &&
          sameTicketEmployee(row.empleado, person.empleado) &&
          row.imputacionYear === year &&
          row.imputacionMonth === month &&
          calendarHasTicketRightOnDate(calendar, row.fechaGasto, ticketIsoWeekdays, noTicket),
      )
      .map((row) => row.fechaGasto),
  );
}

function buildPersonManutencionTicketDayDetails(
  person: TicketPerson,
  calendar: TicketCalendar,
  manutenciones: readonly TicketManutencionImpact[],
  year: number,
  month: number,
): TicketManutencionDetailDay[] {
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  const seenDates = new Set<string>();

  return manutenciones
    .filter(
      (row) =>
        !row.deletedAt &&
        row.afectaTicket &&
        sameTicketEmployee(row.empleado, person.empleado) &&
        row.imputacionYear === year &&
        row.imputacionMonth === month &&
        calendarHasTicketRightOnDate(calendar, row.fechaGasto, ticketIsoWeekdays, noTicket),
    )
    .sort((first, second) => first.fechaGasto.localeCompare(second.fechaGasto))
    .filter((row) => {
      if (seenDates.has(row.fechaGasto)) return false;
      seenDates.add(row.fechaGasto);
      return true;
    })
    .map((row) => ({ id: row.id, fecha: row.fechaGasto }));
}

function buildPersonAbsenceTicketDayDetails(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): TicketDebtDetailDay[] {
  return Array.from(
    buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).entries(),
  )
    .filter(([, absence]) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
    .map(([fecha, absence]) => ({
      id: absence.id,
      fecha,
      motivo: absence.motivo,
      mesOrigen: fecha.slice(0, 7),
    }))
    .sort(
      (first, second) =>
        first.fecha.localeCompare(second.fecha) || first.id.localeCompare(second.id),
    );
}

export function buildMonthTicketDays(
  calendar: TicketCalendar,
  year: number,
  month: number,
): string[] {
  const noTicket = new Set(calendar.diasSinTicket);
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const fecha = toIsoDate(year, month, day);
    if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
      dates.push(fecha);
    }
  }
  return dates;
}

function buildPersonAbsenceTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): Set<string> {
  return new Set(
    Array.from(
      buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).entries(),
    )
      .filter(([, absence]) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
      .map(([fecha]) => fecha),
  );
}

function getAppliedAbsenceIdsForTicketDays(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): string[] {
  if (!calendar) {
    return [];
  }

  return Array.from(
    new Set(
      Array.from(
        buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).values(),
      )
        .filter((absence) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
        .map((absence) => absence.id),
    ),
  );
}

function getAppliedAbsenceDiscountedDaysById(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
  rules: TicketCalculationRules,
): Record<string, number> {
  if (!calendar) {
    return {};
  }

  const discountedDaysByAbsenceId = new Map<string, number>();
  Array.from(
    buildEffectiveAbsenceByTicketDay(person, calendar, absences, monthStart, monthEnd).values(),
  )
    .filter((absence) => !absenceIsNonDiscountableByCalendar(absence, calendar, rules))
    .forEach((absence) => {
      discountedDaysByAbsenceId.set(
        absence.id,
        (discountedDaysByAbsenceId.get(absence.id) ?? 0) + 1,
      );
    });

  return Object.fromEntries(discountedDaysByAbsenceId);
}

function buildEffectiveAbsenceByTicketDay(
  person: TicketPerson,
  calendar: TicketCalendar,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
): Map<string, TicketRestaurantAbsence> {
  const absenceByDate = new Map<string, TicketRestaurantAbsence>();
  const noTicket = new Set(calendar.diasSinTicket);
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));

  getPersonMonthAbsences(person.empleado, absences, monthStart, monthEnd)
    .sort(compareAbsencesByEffectivePriority)
    .forEach((absence) => {
      forEachIsoDate(
        maxIsoDate(absence.desde, monthStart),
        minIsoDate(absence.hasta, monthEnd),
        (fecha) => {
          if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
            absenceByDate.set(fecha, absence);
          }
        },
      );
    });

  return absenceByDate;
}

function compareAbsencesByEffectivePriority(
  first: TicketRestaurantAbsence,
  second: TicketRestaurantAbsence,
): number {
  const updatedComparison = first.updatedAt.localeCompare(second.updatedAt);
  if (updatedComparison !== 0) {
    return updatedComparison;
  }

  const createdComparison = first.createdAt.localeCompare(second.createdAt);
  if (createdComparison !== 0) {
    return createdComparison;
  }

  return first.id.localeCompare(second.id);
}

function calendarHasTicketRightOnDate(
  calendar: TicketCalendar,
  fecha: string,
  ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays)),
  noTicket = new Set(calendar.diasSinTicket),
): boolean {
  return ticketIsoWeekdays.has(getIsoWeekday(fecha)) && !noTicket.has(fecha);
}

function getIsoWeekday(fecha: string): number {
  const day = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function absenceIsNonDiscountableByCalendar(
  absence: TicketRestaurantAbsence,
  calendar: TicketCalendar,
  rules: TicketCalculationRules,
): boolean {
  return Object.entries(rules.nonDiscountableMotivesByCalendar).some(
    ([calendarName, motives]) =>
      normalizeTicketCalendarName(calendar.nombre) === normalizeTicketCalendarName(calendarName) &&
      motives.some((motivo) => normalizePlainText(absence.motivo) === normalizePlainText(motivo)),
  );
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
  };
}

function normalizePlainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getPersonMonthAbsences(
  empleado: string,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
): TicketRestaurantAbsence[] {
  return absences.filter(
    (absence) =>
      !absence.deletedAt &&
      absence.afectaTicket &&
      absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE &&
      sameTicketEmployee(absence.empleado, empleado) &&
      absence.desde <= monthEnd &&
      absence.hasta >= monthStart,
  );
}

function forEachIsoDate(from: string, to: string, visitor: (fecha: string) => void): void {
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    visitor(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

function minIsoDate(first: string, second: string): string {
  return first <= second ? first : second;
}

function maxIsoDate(first: string, second: string): string {
  return first >= second ? first : second;
}

function countMonthNoTicketDays(calendar: TicketCalendar, year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  return calendar.diasSinTicket.filter(
    (fecha) => fecha.startsWith(prefix) && ticketIsoWeekdays.has(getIsoWeekday(fecha)),
  ).length;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildTicketRestaurantAbsence(
  draft: TicketRestaurantAbsenceDraft,
  now: string,
  id: string,
  previous?: TicketRestaurantAbsence,
): TicketRestaurantAbsence {
  return {
    id,
    empleado: draft.empleado.trim(),
    nombreApellidos: draft.nombreApellidos.trim().replace(/\s+/g, ' '),
    desde: draft.desde,
    hasta: draft.hasta,
    motivo: draft.motivo.trim().replace(/\s+/g, ' '),
    totalDias: draft.totalDias,
    afectaTicket: draft.afectaTicket,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleTicketRestaurantAbsences(
  absences: TicketRestaurantAbsence[],
): TicketRestaurantAbsence[] {
  return absences.filter(
    (absence) => !absence.deletedAt && absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE,
  );
}

export interface TicketAbsenceTicketImpactInput {
  empleado: string;
  desde: string;
  hasta: string;
  motivo: string;
}

export interface TicketAbsenceTicketImpactResult {
  diasTicket: number;
  afectaTicket: boolean;
  calendario: string;
}

export function calculateTicketAbsenceTicketImpact(
  absence: TicketAbsenceTicketImpactInput,
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  config: TicketRestaurantConfig,
): TicketAbsenceTicketImpactResult {
  const person = people.find(
    (item) => !item.deletedAt && item.activo && sameTicketEmployee(item.empleado, absence.empleado),
  );
  const calendar = person
    ? calendars.find((item) => !item.deletedAt && item.activo && item.id === person.calendarId)
    : undefined;

  if (!person || !calendar || absence.desde < TICKET_RESTAURANT_MIN_ABSENCE_DATE) {
    return { diasTicket: 0, afectaTicket: false, calendario: calendar?.nombre ?? 'Sin calendario' };
  }

  const syntheticAbsence: TicketRestaurantAbsence = {
    id: 'ticket-absence-preview',
    empleado: absence.empleado,
    nombreApellidos: '',
    desde: absence.desde,
    hasta: absence.hasta,
    motivo: absence.motivo,
    totalDias: 0,
    afectaTicket: true,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
  };

  if (absenceIsNonDiscountableByCalendar(syntheticAbsence, calendar, config.rules)) {
    return { diasTicket: 0, afectaTicket: false, calendario: calendar.nombre };
  }

  const ticketIsoWeekdays = new Set(normalizeTicketIsoWeekdays(calendar.ticketIsoWeekdays));
  const noTicket = new Set(calendar.diasSinTicket);
  let diasTicket = 0;

  forEachIsoDate(absence.desde, absence.hasta, (fecha) => {
    if (calendarHasTicketRightOnDate(calendar, fecha, ticketIsoWeekdays, noTicket)) {
      diasTicket += 1;
    }
  });

  return { diasTicket, afectaTicket: diasTicket > 0, calendario: calendar.nombre };
}

export function filterTicketRestaurantAbsencesByMonth(
  absences: TicketRestaurantAbsence[],
  year: number,
  month: number,
): TicketRestaurantAbsence[] {
  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

  return absences.filter(
    (absence) =>
      !absence.deletedAt &&
      absence.desde >= TICKET_RESTAURANT_MIN_ABSENCE_DATE &&
      absence.desde <= monthEnd &&
      absence.hasta >= monthStart,
  );
}

export function countTicketCalendarDays(
  calendar: TicketCalendar,
  year: number,
  month: number,
): number {
  return buildMonthTicketDays(calendar, year, month).length;
}

export function buildYearCalendar(calendar: TicketCalendar, year: number): CalendarMonth[] {
  const sinTicket = new Set(calendar.diasSinTicket);

  return MONTH_NAMES.map((nombre, monthIndex) => {
    const mes = monthIndex + 1;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const firstDay = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
    const blancosIniciales = firstDay === 0 ? 6 : firstDay - 1;
    const dias = Array.from({ length: daysInMonth }, (_, index) => {
      const diaMes = index + 1;
      const fecha = toIsoDate(year, mes, diaMes);
      const diaSemana = new Date(Date.UTC(year, monthIndex, diaMes)).getUTCDay();

      return {
        fecha,
        diaMes,
        diaSemana,
        esFinDeSemana: diaSemana === 0 || diaSemana === 6,
        sinTicket: sinTicket.has(fecha),
      };
    });

    return {
      mes,
      nombre,
      blancosIniciales,
      dias,
    };
  });
}

export function nextCalendarYear(year: number): number {
  return year + 1;
}

export function previousCalendarYear(year: number): number {
  return year - 1;
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
