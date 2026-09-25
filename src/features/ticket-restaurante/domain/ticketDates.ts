export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function forEachIsoDate(from: string, to: string, visitor: (fecha: string) => void): void {
  const cursor = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (cursor <= end) {
    visitor(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
}

export function minIsoDate(first: string, second: string): string {
  return first <= second ? first : second;
}

export function maxIsoDate(first: string, second: string): string {
  return first >= second ? first : second;
}

export function parseIsoYearMonth(fecha: string): { year: number; month: number } {
  return { year: Number(fecha.slice(0, 4)), month: Number(fecha.slice(5, 7)) };
}

export function addMonths(year: number, month: number, offset: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizePlainText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}
