import { readStorageItem, writeStorageItem } from '../../../services/persistence';

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort(
    (first, second) => first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
  );
}

export function suggestNextPeriodo(periodos: readonly string[]): string {
  const current = periodos[0]?.trim() ?? '';
  const match = /^(\d{4})\D+(\d{4})$/.exec(current);
  if (!match) return '';
  return `${Number(match[1]) + 1}-${Number(match[2]) + 1}`;
}

const TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY =
  'traccion.v1.teletrabajo.puestos.translationAliases';

export function readStoredPuestoAliases(): Record<string, string> {
  try {
    const stored = readStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY);
    if (!stored) return {};

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.entries(parsed).reduce<Record<string, string>>((aliases, [key, value]) => {
      if (typeof value === 'string' && value.trim()) aliases[key] = value;
      return aliases;
    }, {});
  } catch {
    return {};
  }
}

export function persistStoredPuestoAliases(aliases: Record<string, string>): void {
  writeStorageItem(TELETRABAJO_PUESTOS_ALIASES_STORAGE_KEY, JSON.stringify(aliases));
}

export function buildImportSummaryMessage(summary: {
  imported: number;
  updated: number;
  reactivated: number;
  ignored: number;
  missingEmployees: number;
}): string {
  const parts = [
    `${summary.imported} registros importados`,
    `${summary.reactivated} registros reactivados`,
    `${summary.updated} registros actualizados`,
    `${summary.ignored} filas ignoradas`,
  ];
  if (summary.missingEmployees > 0) {
    parts.push(`${summary.missingEmployees} empleados no encontrados en Plantilla`);
  }
  return parts.join(' · ');
}
