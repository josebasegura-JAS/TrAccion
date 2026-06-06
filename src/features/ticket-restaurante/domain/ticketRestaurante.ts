export interface TicketCalendar {
  id: string;
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TicketCalendarDraft {
  nombre: string;
  activo: boolean;
  diasSinTicket: string[];
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

export interface TicketRestaurantConfig {
  importeTicket: number;
  pedidoMensual: number;
}

export interface TicketPersonCalculation {
  empleado: string;
  nombreApellidos: string;
  puesto: string;
  calendario: string;
  diasTeoricos: number;
  diasSinTicket: number;
  ausenciasMes: number;
  deudaEntrante: number;
  ausenciasAplicadas: number;
  deudaPendiente: number;
  ticketsFinales: number;
  importe: number;
  ausenciaIds: string[];
}

export interface TicketMonthCalculation {
  year: number;
  month: number;
  rows: TicketPersonCalculation[];
  totals: {
    personas: number;
    diasTeoricos: number;
    ausenciasMes: number;
    deudaEntrante: number;
    ausenciasAplicadas: number;
    deudaPendiente: number;
    ticketsFinales: number;
    importe: number;
  };
}

export const DEFAULT_TICKET_RESTAURANT_CONFIG: TicketRestaurantConfig = {
  importeTicket: 16,
  pedidoMensual: 0,
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
};

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

export function splitTicketPersonFullName(nombreApellidos: string): Pick<TicketPersonDraft, 'nombre' | 'apellido1' | 'apellido2'> {
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
    empleado: draft.empleado.trim(),
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

export function calculateTicketMonth(
  people: readonly TicketPerson[],
  calendars: readonly TicketCalendar[],
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketMonthCalculation {
  const calendarById = new Map(
    calendars.filter((calendar) => !calendar.deletedAt).map((calendar) => [calendar.id, calendar]),
  );

  const rows = people
    .filter((person) => !person.deletedAt && person.activo)
    .map((person) => {
      const calendar = calendarById.get(person.calendarId);
      const monthResult = calculatePersonTicketLedgerForMonth(
        person,
        calendar,
        absences,
        config,
        year,
        month,
      );

      return monthResult;
    })
    .sort((first, second) =>
      first.nombreApellidos.localeCompare(second.nombreApellidos, 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
    );

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
        deudaEntrante: 0,
        ausenciasAplicadas: 0,
        deudaPendiente: 0,
        ticketsFinales: 0,
        importe: 0,
      },
    ),
  };
}

function calculatePersonTicketLedgerForMonth(
  person: TicketPerson,
  calendar: TicketCalendar | undefined,
  absences: readonly TicketRestaurantAbsence[],
  config: TicketRestaurantConfig,
  year: number,
  month: number,
): TicketPersonCalculation {
  let deudaEntrante = 0;
  let currentMonthResult: Pick<
    TicketPersonCalculation,
    | 'diasTeoricos'
    | 'diasSinTicket'
    | 'ausenciasMes'
    | 'deudaEntrante'
    | 'ausenciasAplicadas'
    | 'deudaPendiente'
    | 'ticketsFinales'
    | 'importe'
    | 'ausenciaIds'
  > = {
    diasTeoricos: 0,
    diasSinTicket: 0,
    ausenciasMes: 0,
    deudaEntrante: 0,
    ausenciasAplicadas: 0,
    deudaPendiente: 0,
    ticketsFinales: 0,
    importe: 0,
    ausenciaIds: [],
  };

  for (let iterMonth = 1; iterMonth <= month; iterMonth += 1) {
    const monthStart = toIsoDate(year, iterMonth, 1);
    const monthEnd = toIsoDate(
      year,
      iterMonth,
      new Date(Date.UTC(year, iterMonth, 0)).getUTCDate(),
    );
    const ticketDays = calendar ? buildMonthWorkDays(calendar, year, iterMonth) : [];
    const absenceDays = calendar
      ? buildPersonAbsenceWeekDays(person.empleado, absences, monthStart, monthEnd)
      : new Set<string>();
    const appliedAbsences = getPersonMonthAbsences(person.empleado, absences, monthStart, monthEnd);
    const deudaMesEntrante = deudaEntrante;
    const demandaDescuento = deudaMesEntrante + absenceDays.size;
    const ausenciasAplicadas = Math.min(ticketDays.length, demandaDescuento);
    const deudaPendiente = Math.max(0, demandaDescuento - ticketDays.length);
    const ticketsFinales = Math.max(0, ticketDays.length - ausenciasAplicadas);

    currentMonthResult = {
      diasTeoricos: ticketDays.length,
      diasSinTicket: calendar ? countMonthNoTicketDays(calendar, year, iterMonth) : 0,
      ausenciasMes: absenceDays.size,
      deudaEntrante: deudaMesEntrante,
      ausenciasAplicadas,
      deudaPendiente,
      ticketsFinales,
      importe: roundCurrency(ticketsFinales * config.importeTicket),
      ausenciaIds: appliedAbsences.map((absence) => absence.id),
    };

    deudaEntrante = deudaPendiente;
  }

  return {
    empleado: person.empleado,
    nombreApellidos: person.nombreApellidos,
    puesto: person.puesto,
    calendario: calendar?.nombre ?? 'Sin calendario',
    ...currentMonthResult,
  };
}

function buildMonthWorkDays(calendar: TicketCalendar, year: number, month: number): string[] {
  const noTicket = new Set(calendar.diasSinTicket);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const fecha = toIsoDate(year, month, day);
    const weekDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekDay !== 0 && weekDay !== 6 && !noTicket.has(fecha)) {
      dates.push(fecha);
    }
  }
  return dates;
}

function buildPersonAbsenceWeekDays(
  empleado: string,
  absences: readonly TicketRestaurantAbsence[],
  monthStart: string,
  monthEnd: string,
): Set<string> {
  const dates = new Set<string>();
  getPersonMonthAbsences(empleado, absences, monthStart, monthEnd).forEach((absence) => {
    forEachIsoDate(
      maxIsoDate(absence.desde, monthStart),
      minIsoDate(absence.hasta, monthEnd),
      (fecha) => {
        if (!isWeekend(fecha)) {
          dates.add(fecha);
        }
      },
    );
  });
  return dates;
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
      absence.empleado === empleado &&
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

function isWeekend(fecha: string): boolean {
  const day = new Date(`${fecha}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function countMonthNoTicketDays(calendar: TicketCalendar, year: number, month: number): number {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return calendar.diasSinTicket.filter((fecha) => fecha.startsWith(prefix)).length;
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
  return absences.filter((absence) => !absence.deletedAt);
}

export function filterTicketRestaurantAbsencesByMonth(
  absences: TicketRestaurantAbsence[],
  year: number,
  month: number,
): TicketRestaurantAbsence[] {
  const monthStart = toIsoDate(year, month, 1);
  const monthEnd = toIsoDate(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());

  return absences.filter(
    (absence) => !absence.deletedAt && absence.desde <= monthEnd && absence.hasta >= monthStart,
  );
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
