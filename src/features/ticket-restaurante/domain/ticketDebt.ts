import type {
  TicketDebtRegularization,
  TicketDebtRegularizationDraft,
  TicketManualDebt,
  TicketManualDebtDraft,
} from './ticketRestauranteTypes';
import { normalizeTicketEmployeeNumber } from './ticketPeople';

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
