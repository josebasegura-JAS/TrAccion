import type {
  HuelgaGeneralShift,
  HuelgaResponseCollection,
  HuelgaZoneResponse,
} from './huelgasResponseCollection';

export type HuelgaResultPeriod = HuelgaGeneralShift | 'global';

export type HuelgaResultMetrics = {
  personasTurno: number;
  serviciosMinimos: number;
  personasTrabajan: number;
  personasHuelga: number;
  personasComputables: number;
  seguimiento: number;
};

export type HuelgaAreaResult = HuelgaResultMetrics & {
  id: string;
  nombre: string;
};

export type HuelgaPeriodResult = {
  period: HuelgaResultPeriod;
  areas: HuelgaAreaResult[];
  totals: HuelgaResultMetrics;
  hasData: boolean;
  zonesWithData: number;
};

export type HuelgaResults = Record<HuelgaResultPeriod, HuelgaPeriodResult>;

export const HUELGA_PERIOD_LABELS: Record<HuelgaResultPeriod, string> = {
  noche: 'Noche',
  manana: 'Mañana',
  tarde: 'Tarde',
  global: 'Global',
};

function percentage(huelga: number, personasTurno: number): number {
  return personasTurno > 0 ? (huelga / personasTurno) * 100 : 0;
}

function metrics(
  personasTurno: number,
  serviciosMinimos: number,
  personasTrabajan: number,
  personasHuelga: number,
): HuelgaResultMetrics {
  // Criterio RRLL: el seguimiento se calcula sobre todas las personas con turno.
  // Los servicios mínimos están incluidos en personas con turno, aunque no en personas que trabajan.
  const personasComputables = personasTurno;
  return {
    personasTurno,
    serviciosMinimos,
    personasTrabajan,
    personasHuelga,
    personasComputables,
    seguimiento: percentage(personasHuelga, personasTurno),
  };
}

function globalArea(response: HuelgaZoneResponse): HuelgaAreaResult | null {
  if (
    response.personasTurno === null ||
    response.serviciosMinimos === null ||
    response.personasTrabajan === null ||
    response.personasHuelga === null
  ) return null;

  return {
    id: response.zonaId,
    nombre: response.zonaNombre,
    ...metrics(
      response.personasTurno,
      response.serviciosMinimos,
      response.personasTrabajan,
      response.personasHuelga,
    ),
  };
}

function shiftArea(response: HuelgaZoneResponse, shift: HuelgaGeneralShift): HuelgaAreaResult | null {
  const rows = (response.generalDetail ?? []).filter((row) => row.turno === shift);
  if (rows.length === 0) return null;

  const sum = (field: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') =>
    rows.reduce((total, row) => total + row[field].hombres + row[field].mujeres, 0);

  return {
    id: response.zonaId,
    nombre: response.zonaNombre,
    ...metrics(sum('personasTurno'), sum('serviciosMinimos'), sum('trabajan'), sum('huelga')),
  };
}

function totalMetrics(areas: HuelgaAreaResult[]): HuelgaResultMetrics {
  const total = areas.reduce(
    (acc, area) => ({
      personasTurno: acc.personasTurno + area.personasTurno,
      serviciosMinimos: acc.serviciosMinimos + area.serviciosMinimos,
      personasTrabajan: acc.personasTrabajan + area.personasTrabajan,
      personasHuelga: acc.personasHuelga + area.personasHuelga,
    }),
    { personasTurno: 0, serviciosMinimos: 0, personasTrabajan: 0, personasHuelga: 0 },
  );
  return metrics(
    total.personasTurno,
    total.serviciosMinimos,
    total.personasTrabajan,
    total.personasHuelga,
  );
}

function periodResult(
  responses: HuelgaZoneResponse[],
  period: HuelgaResultPeriod,
): HuelgaPeriodResult {
  const areas = responses
    .map((response) => period === 'global' ? globalArea(response) : shiftArea(response, period))
    .filter((area): area is HuelgaAreaResult => area !== null)
    .sort((left, right) => right.seguimiento - left.seguimiento || left.nombre.localeCompare(right.nombre, 'es'));

  return {
    period,
    areas,
    totals: totalMetrics(areas),
    hasData: areas.length > 0,
    zonesWithData: areas.length,
  };
}

export function buildHuelgaResults(collection: HuelgaResponseCollection): HuelgaResults {
  const responses = Object.values(collection.responses);
  return {
    noche: periodResult(responses, 'noche'),
    manana: periodResult(responses, 'manana'),
    tarde: periodResult(responses, 'tarde'),
    global: periodResult(responses, 'global'),
  };
}

export function formatSeguimiento(value: number): string {
  return `${value.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

export function huelgaExecutiveSummary(result: HuelgaPeriodResult): string {
  if (!result.hasData || result.totals.personasTurno === 0) {
    return `No hay personas con turno para el corte ${HUELGA_PERIOD_LABELS[result.period].toLowerCase()}.`;
  }

  const ranked = result.areas.filter((area) => area.personasTurno > 0);
  const top = ranked[0];
  const topText = top
    ? ` El mayor seguimiento se registra en ${top.nombre} (${formatSeguimiento(top.seguimiento)}).`
    : '';

  return `El corte ${HUELGA_PERIOD_LABELS[result.period].toLowerCase()} registra un seguimiento del ${formatSeguimiento(result.totals.seguimiento)}, con ${result.totals.personasHuelga.toLocaleString('es-ES')} personas en huelga sobre ${result.totals.personasTurno.toLocaleString('es-ES')} personas con turno.${topText}`;
}

export function seguimientoDelta(
  current: HuelgaPeriodResult,
  previous: HuelgaPeriodResult | undefined,
): number | null {
  if (!previous?.hasData || !current.hasData) return null;
  return current.totals.seguimiento - previous.totals.seguimiento;
}
