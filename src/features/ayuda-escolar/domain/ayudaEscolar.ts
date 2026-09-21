import type { Employee } from '../../plantilla/domain/employee';

export interface SchoolHelpSavedFile {
  originalName: string;
  savedName: string;
  savedPath: string;
}

export interface SchoolHelpRecord {
  id: string;
  empleado: string;
  nombre: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  archivedAt: string;
  files: SchoolHelpSavedFile[];
}

export function normalizeSchoolHelpEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSchoolHelpName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ');
}

export function findSchoolHelpEmployeeCandidates(
  employees: Employee[],
  senderName: string,
  senderEmail: string,
): Employee[] {
  const active = employees.filter((employee) => !employee.deletedAt);
  const email = normalizeSchoolHelpEmail(senderEmail);
  if (email) {
    const byEmail = active.filter((employee) => normalizeSchoolHelpEmail(employee.email) === email);
    if (byEmail.length) return byEmail;
  }

  const name = normalizeSchoolHelpName(senderName);
  if (!name) return [];
  return active.filter((employee) => normalizeSchoolHelpName(employee.nombreApellidos) === name);
}

export function countSchoolHelpFiles(records: SchoolHelpRecord[], empleado: string): number {
  return records
    .filter((record) => record.empleado === empleado)
    .reduce((total, record) => total + record.files.length, 0);
}

export function latestSchoolHelpRecord(
  records: SchoolHelpRecord[],
  empleado: string,
): SchoolHelpRecord | null {
  const matches = records.filter((record) => record.empleado === empleado);
  if (!matches.length) return null;
  return [...matches].sort((a, b) => b.archivedAt.localeCompare(a.archivedAt))[0] ?? null;
}
