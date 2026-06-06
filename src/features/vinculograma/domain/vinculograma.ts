import type { Employee } from '../../plantilla/domain/employee';

export interface Vinculograma {
  id: string;
  employeeNumber: string;
  nombreCompleto: string;
  linkedPerson: string;
  requestDate: string;
  expiryDate: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export type VinculogramaStatus = 'Vigente' | 'Vencido';

export type VinculogramaDraft = Pick<
  Vinculograma,
  'employeeNumber' | 'nombreCompleto' | 'linkedPerson' | 'requestDate'
>;

export interface EmployeeSuggestion {
  empleado: string;
  nombreApellidos: string;
}

export const EMPTY_VINCULOGRAMA_DRAFT: VinculogramaDraft = {
  employeeNumber: '',
  nombreCompleto: '',
  linkedPerson: '',
  requestDate: '',
};

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function calculateExpiryDate(requestDate: string): string {
  if (!isIsoDate(requestDate)) {
    return '';
  }

  const [year, month, day] = requestDate.split('-').map(Number);
  const expiry = new Date(Date.UTC(year + 3, month - 1, day));
  const requestedMonth = month - 1;

  if (expiry.getUTCMonth() !== requestedMonth) {
    expiry.setUTCDate(0);
  }

  return expiry.toISOString().slice(0, 10);
}

export function buildVinculograma(
  draft: VinculogramaDraft,
  now: string,
  id: string,
  previous?: Vinculograma,
): Vinculograma {
  const requestDate = draft.requestDate.trim();

  return {
    id,
    employeeNumber: draft.employeeNumber.trim(),
    nombreCompleto: draft.nombreCompleto.trim(),
    linkedPerson: draft.linkedPerson.trim(),
    requestDate,
    expiryDate: calculateExpiryDate(requestDate),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function getVinculogramaStatus(expiryDate: string, today: string): VinculogramaStatus {
  return expiryDate >= today ? 'Vigente' : 'Vencido';
}

function compareEmployeeNumber(first: string, second: string): number {
  const firstTrimmed = first.trim();
  const secondTrimmed = second.trim();
  const firstNumber = Number(firstTrimmed);
  const secondNumber = Number(secondTrimmed);

  if (Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
    return firstNumber - secondNumber;
  }

  return firstTrimmed.localeCompare(secondTrimmed, 'es', { numeric: true, sensitivity: 'base' });
}

export function sortVinculogramasByEmployeeNumber(records: Vinculograma[]): Vinculograma[] {
  return [...records].sort((first, second) =>
    compareEmployeeNumber(first.employeeNumber, second.employeeNumber),
  );
}

export function visibleVinculogramas(records: Vinculograma[]): Vinculograma[] {
  return records.filter((record) => !record.deletedAt);
}

export function splitVinculogramasByStatus(
  records: Vinculograma[],
  today: string,
): { vigentes: Vinculograma[]; vencidos: Vinculograma[] } {
  const sortedRecords = sortVinculogramasByEmployeeNumber(visibleVinculogramas(records));

  return {
    vigentes: sortedRecords.filter(
      (record) => getVinculogramaStatus(record.expiryDate, today) === 'Vigente',
    ),
    vencidos: sortedRecords.filter(
      (record) => getVinculogramaStatus(record.expiryDate, today) === 'Vencido',
    ),
  };
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

export function findEmployeeByNumber(
  employees: Employee[],
  employeeNumber: string,
): EmployeeSuggestion | null {
  const normalizedNumber = employeeNumber.trim();
  const employee = employees.find(
    (current) => !current.deletedAt && current.empleado.trim() === normalizedNumber,
  );

  return employee
    ? { empleado: employee.empleado, nombreApellidos: employee.nombreApellidos }
    : null;
}

export function suggestEmployees(employees: Employee[], search: string): EmployeeSuggestion[] {
  const normalizedSearch = normalizeSearch(search);

  if (!normalizedSearch) {
    return [];
  }

  return employees
    .filter((employee) => {
      if (employee.deletedAt) {
        return false;
      }

      return (
        normalizeSearch(employee.nombreApellidos).includes(normalizedSearch) ||
        normalizeSearch(employee.empleado).includes(normalizedSearch)
      );
    })
    .sort((first, second) => compareEmployeeNumber(first.empleado, second.empleado))
    .slice(0, 8)
    .map((employee) => ({
      empleado: employee.empleado,
      nombreApellidos: employee.nombreApellidos,
    }));
}
