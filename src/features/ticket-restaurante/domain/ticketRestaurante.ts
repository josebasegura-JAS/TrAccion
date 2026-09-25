import type { TicketCalendarDraft, TicketPersonDraft } from './ticketRestauranteTypes';

export * from './ticketRestauranteTypes';
export {
  buildTicketCalendar,
  buildYearCalendar,
  isIsoDate,
  normalizeDiasSinTicket,
  normalizeTicketCalendarName,
  normalizeTicketIsoWeekdays,
  nextCalendarYear,
  previousCalendarYear,
  toggleDiaSinTicket,
  visibleTicketCalendars,
} from './ticketCalendars';
export {
  buildTicketPerson,
  buildTicketPersonFullName,
  normalizeTicketEmployeeNumber,
  splitTicketPersonFullName,
  ticketPeopleExistingInMonth,
  visibleTicketPeople,
} from './ticketPeople';
export {
  TICKET_RESTAURANT_MIN_ABSENCE_DATE,
  buildTicketRestaurantAbsence,
  calculateTicketAbsenceMonthImpact,
  calculateTicketAbsenceTicketImpact,
  filterTicketRestaurantAbsencesByMonth,
  visibleTicketRestaurantAbsences,
} from './ticketAbsences';
export { buildMonthTicketDays, countTicketCalendarDays } from './ticketEligibility';
export {
  calculateMonthlyTicketOrder,
  calculateTicketContribution,
  calculateTicketMonth,
} from './ticketCalculation';
export {
  DEFAULT_TICKET_RESTAURANT_CONFIG,
  getEffectiveTicketPrice,
  normalizeTicketCalculationRules,
  normalizeTicketPriceHistory,
  ticketWorkflowMonthKey,
  getTicketMonthlyWorkflowReview,
  normalizeTicketRestaurantConfig,
} from './ticketConfig';
export {
  buildTicketManualDebt,
  buildTicketDebtRegularization,
  splitManualDebtInstallments,
} from './ticketDebt';

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

export const EMPTY_TICKET_CALENDAR_DRAFT: TicketCalendarDraft = {
  nombre: '',
  activo: true,
  diasSinTicket: [],
  ticketIsoWeekdays: [1, 2, 3, 4, 5],
};
