import type { Employee } from '../../plantilla/domain/employee';

export const SORTEOS_EXCLUSION_MANUAL_REASON = 'Manual';
export const SORTEOS_WINNER_EXCLUSION_REASON = 'Ganador sorteo';
export const SORTEOS_MAX_SEARCH_RESULTS = 30;
export const SORTEOS_MIN_SEARCH_LENGTH = 2;

export interface SorteosPerson {
  empleado: string;
  nombreApellidos: string;
  searchText: string;
}

export interface SorteosWinner {
  position: number;
  empleado: string;
  nombreApellidos: string;
}

export interface SorteosDraw {
  id: string;
  title: string;
  date: string;
  winners: SorteosWinner[];
  createdAt: string;
}

export interface SorteosExclusion {
  id: string;
  empleado: string;
  nombreApellidos: string;
  reason: string;
  drawId: string | null;
  createdAt: string;
  excludedAt: string;
}

export interface SorteosSummary {
  disponibles: number;
  excluidos: number;
  historico: number;
  totalPlantilla: number;
  totalExcluidas: number;
  totalDisponibles: number;
}

export interface SorteosDraft {
  title: string;
  date: string;
  winnersCount: number;
}

export interface SorteosValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SorteosDeleteResult {
  draws: SorteosDraw[];
  exclusions: SorteosExclusion[];
}

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeSearchText(value: string): string {
  return stripDiacritics(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeSorteosPerson(employee: Employee): SorteosPerson | null {
  const empleado = employee.empleado.trim();
  const nombreApellidos = employee.nombreApellidos.trim();

  if (!empleado || !nombreApellidos || employee.deletedAt) {
    return null;
  }

  return {
    empleado,
    nombreApellidos,
    searchText: normalizeSearchText(`${empleado} ${nombreApellidos}`),
  };
}

export function normalizeSorteosPeople(employees: readonly Employee[]): SorteosPerson[] {
  return employees.reduce<SorteosPerson[]>((people, employee) => {
    const person = normalizeSorteosPerson(employee);
    return person ? [...people, person] : people;
  }, []);
}

export function samePerson(left: Pick<SorteosPerson, 'empleado' | 'nombreApellidos'>, right: Pick<SorteosPerson, 'empleado' | 'nombreApellidos'>): boolean {
  return (
    left.empleado.trim() === right.empleado.trim() ||
    normalizeSearchText(left.nombreApellidos) === normalizeSearchText(right.nombreApellidos)
  );
}

export function hasDuplicateExclusion(
  exclusions: readonly SorteosExclusion[],
  person: Pick<SorteosPerson, 'empleado' | 'nombreApellidos'>,
): boolean {
  return exclusions.some((exclusion) => samePerson(exclusion, person));
}

export function filterAvailablePeople(
  people: readonly SorteosPerson[],
  exclusions: readonly SorteosExclusion[],
): SorteosPerson[] {
  return people.filter((person) => !hasDuplicateExclusion(exclusions, person));
}

export function buildSorteosSummary(
  people: readonly SorteosPerson[],
  exclusions: readonly SorteosExclusion[],
  draws: readonly SorteosDraw[],
): SorteosSummary {
  const disponibles = filterAvailablePeople(people, exclusions).length;
  return {
    disponibles,
    excluidos: exclusions.length,
    historico: draws.length,
    totalPlantilla: people.length,
    totalExcluidas: exclusions.length,
    totalDisponibles: disponibles,
  };
}

export function searchPeopleForExclusion(
  people: readonly SorteosPerson[],
  exclusions: readonly SorteosExclusion[],
  query: string,
): SorteosPerson[] {
  const normalizedQuery = normalizeSearchText(query);

  if (normalizedQuery.length < SORTEOS_MIN_SEARCH_LENGTH) {
    return [];
  }

  return filterAvailablePeople(people, exclusions)
    .filter((person) => person.searchText.includes(normalizedQuery))
    .slice(0, SORTEOS_MAX_SEARCH_RESULTS);
}

export function buildManualExclusion(
  person: SorteosPerson,
  id: string,
  timestamp: string,
): SorteosExclusion {
  return {
    id,
    empleado: person.empleado,
    nombreApellidos: person.nombreApellidos,
    reason: SORTEOS_EXCLUSION_MANUAL_REASON,
    drawId: null,
    createdAt: timestamp,
    excludedAt: timestamp,
  };
}

export function addManualExclusion(
  exclusions: readonly SorteosExclusion[],
  person: SorteosPerson,
  id: string,
  timestamp: string,
): SorteosExclusion[] {
  if (hasDuplicateExclusion(exclusions, person)) {
    return [...exclusions];
  }

  return [...exclusions, buildManualExclusion(person, id, timestamp)];
}

export function validateSorteosDraft(
  draft: SorteosDraft,
  people: readonly SorteosPerson[],
  exclusions: readonly SorteosExclusion[],
): SorteosValidationResult {
  const errors: string[] = [];
  const availableCount = filterAvailablePeople(people, exclusions).length;

  if (!draft.title.trim()) {
    errors.push('El título del sorteo es obligatorio.');
  }

  if (!draft.date.trim()) {
    errors.push('La fecha del sorteo es obligatoria.');
  }

  if (!Number.isInteger(draft.winnersCount) || draft.winnersCount <= 0) {
    errors.push('El nº de ganadores debe ser un entero mayor que 0.');
  }

  if (people.length === 0) {
    errors.push('Debe existir plantilla para realizar el sorteo.');
  }

  if (Number.isInteger(draft.winnersCount) && draft.winnersCount > availableCount) {
    errors.push('El nº de ganadores no puede superar las personas disponibles.');
  }

  return { valid: errors.length === 0, errors };
}

function shufflePeople(people: readonly SorteosPerson[], random: () => number): SorteosPerson[] {
  const shuffled = [...people];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = current;
  }

  return shuffled;
}

export function runSorteo(
  draft: SorteosDraft,
  people: readonly SorteosPerson[],
  exclusions: readonly SorteosExclusion[],
  drawId: string,
  exclusionIdFactory: (position: number, winner: SorteosWinner) => string,
  timestamp: string,
  random: () => number = Math.random,
): { draw: SorteosDraw; exclusions: SorteosExclusion[] } {
  const validation = validateSorteosDraft(draft, people, exclusions);

  if (!validation.valid) {
    throw new Error(validation.errors.join('\n'));
  }

  const winners = shufflePeople(filterAvailablePeople(people, exclusions), random)
    .slice(0, draft.winnersCount)
    .map<SorteosWinner>((person, index) => ({
      position: index + 1,
      empleado: person.empleado,
      nombreApellidos: person.nombreApellidos,
    }));

  const winnerExclusions = winners.map<SorteosExclusion>((winner) => ({
    id: exclusionIdFactory(winner.position, winner),
    empleado: winner.empleado,
    nombreApellidos: winner.nombreApellidos,
    reason: SORTEOS_WINNER_EXCLUSION_REASON,
    drawId,
    createdAt: timestamp,
    excludedAt: timestamp,
  }));

  return {
    draw: {
      id: drawId,
      title: draft.title.trim(),
      date: draft.date,
      winners,
      createdAt: timestamp,
    },
    exclusions: [...exclusions, ...winnerExclusions],
  };
}

export function removeExclusionById(
  exclusions: readonly SorteosExclusion[],
  exclusionId: string,
): SorteosExclusion[] {
  return exclusions.filter((exclusion) => exclusion.id !== exclusionId);
}

export function resetWinnerExclusionsForDraw(
  exclusions: readonly SorteosExclusion[],
  drawId: string,
): SorteosExclusion[] {
  return exclusions.filter(
    (exclusion) =>
      !(exclusion.drawId === drawId && exclusion.reason === SORTEOS_WINNER_EXCLUSION_REASON),
  );
}

export function deleteSorteo(
  draws: readonly SorteosDraw[],
  exclusions: readonly SorteosExclusion[],
  drawId: string,
  removeLinkedWinnerExclusions: boolean,
): SorteosDeleteResult {
  return {
    draws: draws.filter((draw) => draw.id !== drawId),
    exclusions: removeLinkedWinnerExclusions
      ? resetWinnerExclusionsForDraw(exclusions, drawId)
      : [...exclusions],
  };
}
