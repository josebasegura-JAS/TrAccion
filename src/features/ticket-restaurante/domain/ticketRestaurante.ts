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
}

export interface TicketManualDebt {
  id: string;
  empleado: string;
  nombreApellidos: string;
  totalTickets: number;
  originYear: number;
  originMonth: number;
  startYear: number;
  startMonth: number;
  months: number;
  reason: string;
  observations: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  cancellationReason: string;
}

export interface TicketDebtRegularization {
  id: string;
  empleado: string;
  nombreApellidos: string;
  year: number;
  month: number;
  calculatedTickets: number;
  targetTickets: number;
  reason: string;
  observations: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDebtRegularizationDraft {
  empleado: string;
  nombreApellidos: string;
  year: number;
  month: number;
  calculatedTickets: number;
  targetTickets: number;
  reason: string;
  observations: string;
}

export interface TicketManualDebtDraft {
  empleado: string;
  nombreApellidos: string;
  totalTickets: number;
  originYear: number;
  originMonth: number;
  startYear: number;
  startMonth: number;
  months: number;
  reason: string;
  observations: string;
}

export interface TicketRestaurantConfig {
  importeTicket: number;
  pedidoMensual: number;
  priceHistory: TicketPriceHistoryEntry[];
  rules: TicketCalculationRules;
  manualDebts?: TicketManualDebt[];
  debtRegularizations?: TicketDebtRegularization[];
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
  },
  manualDebts: [],
  debtRegularizations: [],
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
  kind: 'absence' | 'manutencion' | 'manual' | 'regularization';
  manualDebtId?: string;
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

  // La simulación arranca en el primer mes de contribución, así que las
  // hojas de gasto imputadas al mes de arranque de la deuda (o a meses
  // anteriores) nunca serían el "mes del cursor" y se perderían. Se siembran
  // aquí en la cola, en orden cronológico de imputación, para que descuenten
  // en cuanto haya capacidad.
  const firstContributionKey = firstContribution.year * 100 + firstContribution.month;
  Array.from(
    new Set(
      manutenciones
        .filter(
          (row) =>
            !row.deletedAt &&
            row.afectaTicket &&
            sameTicketEmployee(row.empleado, person.empleado) &&
            row.imputacionYear * 100 + row.imputacionMonth < firstContributionKey,
        )
        .map((row) => row.imputacionYear * 100 + row.imputacionMonth),
    ),
  )
    .sort((first, second) => first - second)
    .forEach((imputacionKey) => {
      pendingDiscounts.push(
        ...buildPersonManutencionDiscountDetails(
          person,
          calendar,
          manutenciones,
          Math.floor(imputacionKey / 100),
          imputacionKey % 100,
        ),
      );
    });

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

    applyDebtRegularizationForMonth(
      pendingDiscounts,
      person,
      config.debtRegularizations ?? [],
      cursorYear,
      cursorMonth,
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

    // Las deudas manuales se incorporan por cuotas en el mes programado.
    // Si una cuota no cabe, permanece en la misma cola y se arrastra como el resto de deuda.
    (config.manualDebts ?? [])
      .filter((debt) => sameTicketEmployee(debt.empleado, person.empleado))
      .forEach((debt) => {
        const cursorMonthStart = toIsoDate(cursorYear, cursorMonth, 1);
        const cancellationMonthStart = debt.cancelledAt ? `${debt.cancelledAt.slice(0, 7)}-01` : null;
        if (cancellationMonthStart && cursorMonthStart >= cancellationMonthStart) {
          for (let index = pendingDiscounts.length - 1; index >= 0; index -= 1) {
            if (pendingDiscounts[index]?.manualDebtId === debt.id) pendingDiscounts.splice(index, 1);
          }
          return;
        }
        const installments = splitManualDebtInstallments(debt.totalTickets, debt.months);
        installments.forEach((amount, installmentIndex) => {
          const installmentMonth = addMonths(debt.startYear, debt.startMonth, installmentIndex);
          if (installmentMonth.year !== cursorYear || installmentMonth.month !== cursorMonth) return;
          for (let unit = 0; unit < amount; unit += 1) {
            pendingDiscounts.push({
              id: `manual-debt:${debt.id}:${cursorYear}-${String(cursorMonth).padStart(2, '0')}:${unit + 1}`,
              fecha: toIsoDate(cursorYear, cursorMonth, 1),
              motivo: `Deuda manual: ${debt.reason}`,
              mesOrigen: `${debt.originYear}-${String(debt.originMonth).padStart(2, '0')}`,
              kind: 'manual',
              manualDebtId: debt.id,
            });
          }
        });
      });

    const availableTickets = buildMonthTicketDays(calendar, cursorYear, cursorMonth).length;
    const appliedCount = Math.min(availableTickets, pendingDiscounts.length);
    const appliedDiscounts = pendingDiscounts.splice(0, appliedCount);

    if (cursorYear === targetYear && cursorMonth === targetMonth) {
      const discountedDaysById = new Map<string, number>();
      appliedDiscounts
        .filter((detail) => detail.kind === 'absence')
        .forEach((detail) => {
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
        ausenciaIds: Array.from(
          new Set(appliedDiscounts.filter((detail) => detail.kind === 'absence').map((detail) => detail.id)),
        ),
        ausenciaDiasDescontados: Object.fromEntries(discountedDaysById),
        // Ausencias y deuda manual: las hojas de gasto aplicadas ya se listan en
        // hojaGastoDetalle y duplicarlas aquí inflaría el detalle del modal.
        deudaAplicadaDetalle: appliedDiscounts
          .filter((detail) => detail.kind !== 'manutencion')
          .map(stripPendingDiscountKind),
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

function applyDebtRegularizationForMonth(
  pendingDiscounts: PendingMonthlyDiscount[],
  person: TicketPerson,
  regularizations: readonly TicketDebtRegularization[],
  year: number,
  month: number,
): void {
  const regularization = regularizations
    .filter(
      (item) =>
        sameTicketEmployee(item.empleado, person.empleado) &&
        item.year === year &&
        item.month === month,
    )
    .sort((first, second) => first.updatedAt.localeCompare(second.updatedAt))
    .at(-1);
  if (!regularization) return;

  const target = Math.max(0, Math.trunc(regularization.targetTickets));
  if (pendingDiscounts.length > target) {
    pendingDiscounts.splice(target);
    return;
  }

  const missing = target - pendingDiscounts.length;
  for (let unit = 0; unit < missing; unit += 1) {
    pendingDiscounts.push({
      id: `debt-regularization:${regularization.id}:${unit + 1}`,
      fecha: toIsoDate(year, month, 1),
      motivo: `Regularización: ${regularization.reason}`,
      mesOrigen: `${year}-${String(month).padStart(2, '0')}`,
      kind: 'regularization',
    });
  }
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

export function buildTicketManualDebt(
  draft: TicketManualDebtDraft,
  now: string,
  id: string,
): TicketManualDebt {
  return {
    id,
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
    nombreApellidos: draft.nombreApellidos.trim(),
    totalTickets: Math.max(1, Math.trunc(draft.totalTickets)),
    originYear: Math.trunc(draft.originYear),
    originMonth: Math.min(12, Math.max(1, Math.trunc(draft.originMonth))),
    startYear: Math.trunc(draft.startYear),
    startMonth: Math.min(12, Math.max(1, Math.trunc(draft.startMonth))),
    months: Math.min(
      Math.max(1, Math.trunc(draft.totalTickets)),
      Math.max(1, Math.trunc(draft.months)),
    ),
    reason: draft.reason.trim(),
    observations: draft.observations.trim(),
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
    cancellationReason: '',
  };
}

export function buildTicketDebtRegularization(
  draft: TicketDebtRegularizationDraft,
  now: string,
  id: string,
): TicketDebtRegularization {
  return {
    id,
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
    nombreApellidos: draft.nombreApellidos.trim(),
    year: Math.trunc(draft.year),
    month: Math.min(12, Math.max(1, Math.trunc(draft.month))),
    calculatedTickets: Math.max(0, Math.trunc(draft.calculatedTickets)),
    targetTickets: Math.max(0, Math.trunc(draft.targetTickets)),
    reason: draft.reason.trim(),
    observations: draft.observations.trim(),
    createdAt: now,
    updatedAt: now,
  };
}

export function splitManualDebtInstallments(totalTickets: number, months: number): number[] {
  const total = Math.max(0, Math.trunc(totalTickets));
  const count = Math.max(1, Math.min(total || 1, Math.trunc(months)));
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
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
    empleado: normalizeTicketEmployeeNumber(draft.empleado),
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
