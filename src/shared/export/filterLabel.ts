export function buildFilterLabel(
  filters: Array<[string, string | number | boolean | null | undefined]>,
): string | undefined {
  const activeFilters = filters
    .map(
      ([label, value]) =>
        [label, value === null || value === undefined ? '' : String(value).trim()] as const,
    )
    .filter(([, value]) => value.length > 0);

  if (activeFilters.length === 0) {
    return undefined;
  }

  return activeFilters.map(([label, value]) => `${label}: ${value}`).join(' · ');
}
