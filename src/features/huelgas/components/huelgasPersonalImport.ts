import type { TabularRow } from '../../../shared/import/xlsxParser';

export type HuelgaPersonalTurno = {
  id: string;
  residenciaEstacion: string;
  inicio: string;
  salida: string;
  entrada: string;
  fin: string;
  nombreApellidos: string;
  puesto: string;
  turno: string;
};

export type HuelgaPersonalImportResult = {
  records: HuelgaPersonalTurno[];
  skippedRows: number;
};

const REQUIRED_HEADERS = [
  'resi./estac.',
  'inicio',
  'salida',
  'entrada',
  'fin',
  'nombre y apellidos',
  'puesto',
  'turno',
] as const;

function normalizeHeader(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .trim()
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ');
}

function cleanText(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function excelTimeToHHmm(value: string): string {
  const cleaned = cleanText(value);
  if (!cleaned) return '';

  if (/^\d{1,2}:\d{2}$/.test(cleaned)) {
    const [hour, minute] = cleaned.split(':').map(Number);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const numeric = Number(cleaned.replace(',', '.'));
  if (!Number.isFinite(numeric)) return cleaned;

  // Excel guarda las horas como fracción de un día. También toleramos números
  // con parte entera (fecha+hora) quedándonos únicamente con la fracción horaria.
  const fraction = ((numeric % 1) + 1) % 1;
  const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function stableId(rowNumber: number, name: string): string {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `turno-${rowNumber}-${normalized || 'persona'}`;
}

export function parseHuelgaPersonalRows(rows: TabularRow[]): HuelgaPersonalImportResult {
  if (rows.length === 0) {
    throw new Error('El Excel no contiene filas para importar.');
  }

  const headers = rows[0].map(normalizeHeader);
  const indexByHeader = new Map(headers.map((header, index) => [header, index]));
  const missing = REQUIRED_HEADERS.filter((header) => !indexByHeader.has(header));
  if (missing.length > 0) {
    throw new Error(`El Excel no tiene el formato esperado. Faltan columnas: ${missing.join(', ')}.`);
  }

  const column = (name: (typeof REQUIRED_HEADERS)[number]) => indexByHeader.get(name) ?? -1;
  const records: HuelgaPersonalTurno[] = [];
  let skippedRows = 0;
  let currentResidenciaEstacion = '';

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const residenciaValue = cleanText(row[column('resi./estac.')] ?? '');
    if (residenciaValue) {
      currentResidenciaEstacion = residenciaValue;
    }

    const nombreApellidos = cleanText(row[column('nombre y apellidos')] ?? '');
    if (!nombreApellidos) {
      const hasOtherData = row.some((value) => cleanText(value ?? '') !== '');
      if (hasOtherData) skippedRows += 1;
      continue;
    }

    records.push({
      id: stableId(index + 1, nombreApellidos),
      residenciaEstacion: currentResidenciaEstacion,
      inicio: excelTimeToHHmm(row[column('inicio')] ?? ''),
      salida: excelTimeToHHmm(row[column('salida')] ?? ''),
      entrada: excelTimeToHHmm(row[column('entrada')] ?? ''),
      fin: excelTimeToHHmm(row[column('fin')] ?? ''),
      nombreApellidos,
      puesto: cleanText(row[column('puesto')] ?? ''),
      turno: cleanText(row[column('turno')] ?? ''),
    });
  }

  if (records.length === 0) {
    throw new Error('No se ha encontrado personal con nombre y apellidos en el Excel.');
  }

  return { records, skippedRows };
}
