import { parseXlsxRows } from '../../../shared/import/xlsxParser';

export interface ImportedLotteryPerson {
  nombre: string;
  email: string;
  telefono: string;
  empleado?: string | null;
  externa?: boolean;
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

function findHeaderRow(rows: string[][]): { rowIndex: number; nameIndex: number; emailIndex: number; phoneIndex: number } | null {
  const limit = Math.min(rows.length, 12);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const nameIndex = findColumn(headers, ['nombre', 'persona', 'apellidos', 'nombre y apellidos']);
    const emailIndex = findColumn(headers, ['email', 'correo', 'e-mail']);
    const phoneIndex = findColumn(headers, ['telefono', 'movil', 'phone']);
    if (nameIndex >= 0) {
      return { rowIndex, nameIndex, emailIndex, phoneIndex };
    }
  }
  return null;
}

function isSummaryRow(name: string): boolean {
  const normalized = normalizeHeader(name);
  return normalized === 'total'
    || normalized.startsWith('importe')
    || normalized.startsWith('entregado a')
    || normalized.startsWith('a gustavo')
    || normalized.startsWith('ano ')
    || normalized.startsWith('se le pide');
}

export async function importLotteryPeopleFromXlsx(file: File): Promise<ImportedLotteryPerson[]> {
  const rows = await parseXlsxRows(await file.arrayBuffer());
  if (rows.length < 2) return [];

  const header = findHeaderRow(rows);
  if (!header) {
    throw new Error('No se ha encontrado una columna de Nombre en el Excel.');
  }

  return rows.slice(header.rowIndex + 1).reduce<ImportedLotteryPerson[]>((people, row) => {
    const nombre = (row[header.nameIndex] ?? '').trim();
    const email = header.emailIndex >= 0 ? (row[header.emailIndex] ?? '').trim() : '';
    const telefono = header.phoneIndex >= 0 ? (row[header.phoneIndex] ?? '').trim() : '';

    if (!nombre || isSummaryRow(nombre)) return people;
    people.push({ nombre, email, telefono });
    return people;
  }, []);
}
