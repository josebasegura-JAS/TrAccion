import { parseXlsxRows } from '../../../shared/import/xlsxParser';

export interface ImportedLotteryPerson {
  nombre: string;
  email: string;
  telefono: string;
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function findColumn(headers: string[], candidates: string[]): number {
  return headers.findIndex((header) => candidates.some((candidate) => header.includes(candidate)));
}

export async function importLotteryPeopleFromXlsx(file: File): Promise<ImportedLotteryPerson[]> {
  const rows = await parseXlsxRows(await file.arrayBuffer());
  if (rows.length < 2) return [];

  const headers = rows[0].map(normalizeHeader);
  const nameIndex = findColumn(headers, ['nombre', 'persona', 'apellidos', 'nombre y apellidos']);
  const emailIndex = findColumn(headers, ['email', 'correo', 'e-mail']);
  const phoneIndex = findColumn(headers, ['telefono', 'movil', 'phone']);

  if (nameIndex < 0 && emailIndex < 0) {
    throw new Error('No se han encontrado columnas reconocibles de persona o email. Cuando me pases el Excel definitivo ajustaremos el importador a su estructura exacta.');
  }

  return rows.slice(1).reduce<ImportedLotteryPerson[]>((people, row) => {
    const nombre = nameIndex >= 0 ? (row[nameIndex] ?? '').trim() : '';
    const email = emailIndex >= 0 ? (row[emailIndex] ?? '').trim() : '';
    const telefono = phoneIndex >= 0 ? (row[phoneIndex] ?? '').trim() : '';
    if (!nombre && !email) return people;
    people.push({ nombre, email, telefono });
    return people;
  }, []);
}
