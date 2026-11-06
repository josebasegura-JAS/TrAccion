/** Selecciona la campaña vigente o la del año próximo si ya se ha abierto. */
export function selectCurrentLotteryCampaignYear(years: readonly string[], currentYear: number): number {
  // Nunca recuperar automáticamente una campaña histórica como activa.
  const available = years.map(Number).filter((year) =>
    Number.isInteger(year) && year >= currentYear && year <= currentYear + 1,
  );
  return available.length > 0 ? Math.max(...available) : currentYear;
}
