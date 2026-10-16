import type { HuelgaGeneralDetail, ParsedHuelgaResponse } from './huelgasResponseCollection';

export function huelgaTotalsFromDetail(detail: HuelgaGeneralDetail[]) {
  const sum = (key: 'personasTurno' | 'serviciosMinimos' | 'trabajan' | 'huelga') =>
    detail.reduce((total, row) => total + row[key].hombres + row[key].mujeres, 0);

  return {
    personasTurno: sum('personasTurno'),
    serviciosMinimos: sum('serviciosMinimos'),
    personasTrabajan: sum('trabajan'),
    personasHuelga: sum('huelga'),
  };
}

export function normalizeParsedHuelgaResponseTotals(parsed: ParsedHuelgaResponse): ParsedHuelgaResponse {
  if (!parsed.generalDetail?.length) return parsed;

  return {
    ...parsed,
    ...huelgaTotalsFromDetail(parsed.generalDetail),
  };
}
