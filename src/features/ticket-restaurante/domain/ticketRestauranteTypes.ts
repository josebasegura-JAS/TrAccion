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

export interface TicketManualPerson {
  id: string;
  empleado: string;
  nombreApellidos: string;
  dni: string;
  activo: boolean;
  includeContribution: boolean;
  area?: string;
  monthlyTickets: Record<string, number>;
  inactiveFromMonth?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMonthlySnapshotRow {
  empleado: string;
  nombreApellidos: string;
  area: string;
  tickets: number;
  importe: number;
  manual: boolean;
}

export interface TicketMonthlySnapshot {
  year: number;
  month: number;
  closedAt: string;
  rows: TicketMonthlySnapshotRow[];
}

export interface TicketAnnualClosure {
  year: number;
  closedAt: string;
}

export interface TicketMonthlyWorkflowReview {
  absencesReviewed: boolean;
  manutencionesReviewed: boolean;
  manualDebtsReviewed: boolean;
}

export interface TicketRestaurantConfig {
  importeTicket: number;
  pedidoMensual: number;
  priceHistory: TicketPriceHistoryEntry[];
  rules: TicketCalculationRules;
  manualDebts?: TicketManualDebt[];
  debtRegularizations?: TicketDebtRegularization[];
  manualPeople?: TicketManualPerson[];
  workflowReviews?: Record<string, TicketMonthlyWorkflowReview>;
  monthlySnapshots?: Record<string, TicketMonthlySnapshot>;
  annualClosures?: Record<string, TicketAnnualClosure>;
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
  manualEntry?: boolean;
  manualIncludeContribution?: boolean;
  ausenciaIds: string[];
  ausenciaDiasDescontados: Record<string, number>;
  deudaEntranteDetalle: TicketDebtDetailDay[];
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

export interface TicketAbsenceMonthImpact {
  calendario: string;
  diasTicketMes: number;
  descuentaTicket: boolean;
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

