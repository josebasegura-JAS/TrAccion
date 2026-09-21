export interface SchoolHelpRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  archivedAt: string;
  files: SchoolHelpArchivedFile[];
}

export interface SchoolHelpArchivedFile {
  originalName: string;
  savedName: string;
  savedPath: string;
}

export interface OutlookMessageInspection {
  senderName: string;
  senderEmail: string;
  subject: string;
  receivedAt: string;
  attachments: Array<{ name: string; size: number }>;
}

export interface SchoolHelpArchiveResult {
  ok: boolean;
  message: string;
  inspection?: OutlookMessageInspection;
  files?: SchoolHelpArchivedFile[];
}

export function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function findEmployeeCandidates<T extends { empleado: string; nombreApellidos: string; deletedAt: string | null }>(
  senderName: string,
  employees: T[],
): T[] {
  const sender = normalizePersonName(senderName);
  if (!sender) return [];
  const senderTokens = new Set(sender.split(' ').filter((token) => token.length > 1));

  return employees
    .filter((employee) => !employee.deletedAt)
    .map((employee) => {
      const employeeName = normalizePersonName(employee.nombreApellidos);
      const employeeTokens = new Set(employeeName.split(' ').filter((token) => token.length > 1));
      const common = [...senderTokens].filter((token) => employeeTokens.has(token)).length;
      const coverage = common / Math.max(1, Math.min(senderTokens.size, employeeTokens.size));
      const exact = sender === employeeName;
      return { employee, score: exact ? 2 : coverage };
    })
    .filter(({ score }) => score >= 0.66)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => index === 0 || item.score >= all[0].score - 0.15)
    .map(({ employee }) => employee);
}
