import type { Employee } from '../../plantilla/domain/employee';
import type { ImportedLotteryPerson } from './importLotteryPeople';

export interface LotteryEmployeeCandidate {
  empleado: string;
  nombreApellidos: string;
  score: number;
}

export type LotteryMatchKind = 'exact' | 'suggested' | 'none';

export interface LotteryImportReview {
  id: string;
  imported: ImportedLotteryPerson;
  matchKind: LotteryMatchKind;
  candidates: LotteryEmployeeCandidate[];
  selectedEmpleado: string | null;
  externa: boolean;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[right.length];
}

function similarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(left, right) / maxLength;
}

function scoreEmployee(importedName: string, employeeName: string): number {
  const imported = normalizeText(importedName);
  const employee = normalizeText(employeeName);
  if (!imported || !employee) return 0;
  if (imported === employee) return 100;

  const importedTokens = imported.split(' ').filter(Boolean);
  const employeeTokens = employee.split(' ').filter(Boolean);
  const importedFirst = importedTokens[0] ?? '';
  const employeeFirst = employeeTokens[0] ?? '';
  const importedSurnameTokens = importedTokens.length > 1 ? importedTokens.slice(1) : importedTokens;

  const exactSurnameMatches = importedSurnameTokens.filter((token) => employeeTokens.includes(token)).length;
  const surnameScore = Math.min(70, exactSurnameMatches * 55);

  const bestSurnameSimilarity = importedSurnameTokens.reduce((best, token) => {
    const candidate = employeeTokens.reduce((employeeBest, employeeToken) => Math.max(employeeBest, similarity(token, employeeToken)), 0);
    return Math.max(best, candidate);
  }, 0);
  const fuzzySurnameScore = bestSurnameSimilarity >= 0.82 ? bestSurnameSimilarity * 45 : 0;

  const firstNameSimilarity = similarity(importedFirst, employeeFirst);
  const firstNameScore = firstNameSimilarity >= 0.7 ? firstNameSimilarity * 25 : 0;

  const compactSimilarity = similarity(imported.replace(/ /g, ''), employee.replace(/ /g, '')) * 15;
  return Math.min(99, Math.round(Math.max(surnameScore, fuzzySurnameScore) + firstNameScore + compactSimilarity));
}

function createId(index: number): string {
  return `loteria-import-${Date.now()}-${index}`;
}

export function buildLotteryImportReview(
  importedPeople: ImportedLotteryPerson[],
  employees: Employee[],
): LotteryImportReview[] {
  const activeEmployees = employees.filter((employee) => !employee.deletedAt && employee.nombreApellidos.trim());

  return importedPeople.map((imported, index) => {
    const candidates = activeEmployees
      .map((employee): LotteryEmployeeCandidate => ({
        empleado: employee.empleado,
        nombreApellidos: employee.nombreApellidos,
        score: scoreEmployee(imported.nombre, employee.nombreApellidos),
      }))
      .sort((left, right) => right.score - left.score || left.nombreApellidos.localeCompare(right.nombreApellidos, 'es'))
      .slice(0, 6);

    const top = candidates[0];
    const exact = top?.score === 100;
    const suggested = !exact && Boolean(top && top.score >= 60);

    return {
      id: createId(index),
      imported,
      matchKind: exact ? 'exact' : suggested ? 'suggested' : 'none',
      candidates,
      selectedEmpleado: exact || suggested ? top.empleado : null,
      externa: !exact && !suggested,
    };
  });
}
