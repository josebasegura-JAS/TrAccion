import type {
  TicketCalendar,
  TicketDebtDetailDay,
  TicketManutencionDetailDay,
  TicketManutencionImpact,
  TicketMonthCalculation,
  TicketPerson,
  TicketPersonCalculation,
  TicketRestaurantAbsence,
  TicketRestaurantConfig,
  TicketDebtRegularization,
} from './ticketRestauranteTypes';
import { sameTicketEmployee, splitTicketPersonFullName } from './ticketPeople';
import {
  buildPersonAbsenceTicketDayDetails,
  buildPersonAbsenceTicketDays,
  getAppliedAbsenceDiscountedDaysById,
  getAppliedAbsenceIdsForTicketDays,
} from './ticketAbsences';
import { addMonths, maxIsoDate, parseIsoYearMonth, roundCurrency, toIsoDate } from './ticketDates';
import { buildMonthTicketDays, countMonthNoTicketDays } from './ticketEligibility';
import {
  buildPersonManutencionTicketDayDetails,
  buildPersonManutencionTicketDays,
} from './ticketManutenciones';
import { getEffectiveTicketPrice, normalizeTicketRestaurantConfig } from './ticketConfig';
import { splitManualDebtInstallments } from './ticketDebt';

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

  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const manualRows = (effectiveConfig.manualPeople ?? [])
    .filter((person) =>
      person.activo &&
      (!person.inactiveFromMonth || monthKey < person.inactiveFromMonth) &&
      (mode === 'monthlyOrderWithDebt' || person.includeContribution),
    )
    .map((person): TicketPersonCalculation => {
      const tickets = Math.max(0, Math.trunc(person.monthlyTickets[monthKey] ?? 0));
      const effectivePrice = getEffectiveTicketPrice(effectiveConfig, year, month);
      const name = splitTicketPersonFullName(person.nombreApellidos);
      return {
        empleado: person.empleado,
        nombre: name.nombre,
        apellido1: name.apellido1,
        apellido2: name.apellido2,
        dni: person.dni,
        nombreApellidos: person.nombreApellidos,
        puesto: '',
        calendario: 'Manual',
        diasTeoricos: 0,
        diasSinTicket: 0,
        ausenciasMes: 0,
        hojasGastoMes: 0,
        deudaEntrante: 0,
        ausenciasAplicadas: 0,
        deudaPendiente: 0,
        ticketsFinales: tickets,
        importe: roundCurrency(tickets * effectivePrice),
        manualEntry: true,
        manualIncludeContribution: person.includeContribution,
        ausenciaIds: [],
        ausenciaDiasDescontados: {},
        deudaEntranteDetalle: [],
        deudaAplicadaDetalle: [],
        deudaPendienteDetalle: [],
        hojaGastoDetalle: [],
      };
    });
  rows.push(...manualRows);
  rows.sort(compareTicketCalculationRowsByEmployee);

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
    deudaEntranteDetalle: [],
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
    deudaEntranteDetalle: debtStatus.deudaEntranteDetalle,
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
  deudaEntranteDetalle: TicketDebtDetailDay[];
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
    const deudaEntranteDetalle = pendingDiscounts.map(stripPendingDiscountKind);
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
        deudaEntranteDetalle,
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
    deudaEntranteDetalle: [],
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
