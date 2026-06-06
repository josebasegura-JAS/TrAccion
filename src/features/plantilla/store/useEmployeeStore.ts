import { create } from 'zustand';
import { mockEmployees } from '../../../data/mockEmployees';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_FILTERS, filterEmployees, type EmployeeFilters } from '../domain/filters';
import { importEmployeesFromFile } from '../domain/importExcel';
import { importJobPositionTranslationsFromFile } from '../domain/importJobPositionTranslations';
import { normalizeJobPosition, type JobPositionTranslation } from '../domain/jobPositionTranslation';
import type { Employee, EmployeeDraft } from '../domain/employee';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';

const STORAGE_KEY = 'traccion.v1.plantilla.employees';
const JOB_POSITION_TRANSLATIONS_STORAGE_KEY = 'traccion.v1.plantilla.jobPositionTranslations';

interface EmployeeState {
  employees: Employee[];
  selectedEmployeeId: string;
  filters: EmployeeFilters;
  jobPositionTranslations: JobPositionTranslation[];
  load: () => void;
  save: () => void;
  create: (draft: EmployeeDraft) => void;
  update: (empleado: string, draft: EmployeeDraft) => void;
  remove: (empleado: string) => void;
  importExcel: (file: File) => Promise<void>;
  importJobPositionTranslations: (file: File) => Promise<number>;
  updateEmptyEmployeeJobPositionTranslations: () => { updated: number; missing: number };
  selectEmployee: (employeeId: string) => void;
  setFilter: <K extends keyof EmployeeFilters>(key: K, value: EmployeeFilters[K]) => void;
}

function isEmployee(value: unknown): value is Employee {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Employee, unknown>>;
  return typeof candidate.empleado === 'string' && typeof candidate.nombreApellidos === 'string';
}

function readEmployees(): Employee[] {
  const stored = readStorageItem(STORAGE_KEY);
  if (!stored) {
    return mockEmployees;
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return mockEmployees;
  }

  return parsed.filter(isEmployee).map((employee) => hydrateEmployee(employee, employee.deletedAt));
}

function persistEmployees(employees: Employee[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(employees));
}

function isJobPositionTranslation(value: unknown): value is JobPositionTranslation {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof JobPositionTranslation, unknown>>;
  return typeof candidate.puestoCastellano === 'string' && typeof candidate.puestoEuskera === 'string';
}

function readJobPositionTranslations(): JobPositionTranslation[] {
  const stored = readStorageItem(JOB_POSITION_TRANSLATIONS_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isJobPositionTranslation);
}

function persistJobPositionTranslations(translations: JobPositionTranslation[]): void {
  writeStorageItem(JOB_POSITION_TRANSLATIONS_STORAGE_KEY, JSON.stringify(translations));
}

function upsertJobPositionTranslations(
  current: JobPositionTranslation[],
  imported: JobPositionTranslation[],
): JobPositionTranslation[] {
  const translationsByPosition = new Map(
    current.map((translation) => [normalizeJobPosition(translation.puestoCastellano), translation]),
  );

  imported.forEach((translation) => {
    translationsByPosition.set(normalizeJobPosition(translation.puestoCastellano), translation);
  });

  return Array.from(translationsByPosition.values()).sort((first, second) =>
    first.puestoCastellano.localeCompare(second.puestoCastellano, 'es', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
}


function resolveEmployeeJobPositionTranslation(
  employee: Employee,
  translations: JobPositionTranslation[],
): string {
  const positionKeys = [employee.puestoNomina, employee.puestoOrganizativo]
    .map((position) => normalizeJobPosition(position))
    .filter(Boolean);

  if (!positionKeys.length) {
    return '';
  }

  const translationsByPosition = new Map(
    translations.map((translation) => [normalizeJobPosition(translation.puestoCastellano), translation.puestoEuskera]),
  );

  for (const positionKey of positionKeys) {
    const translatedPosition = translationsByPosition.get(positionKey);
    if (translatedPosition) {
      return translatedPosition;
    }
  }

  return '';
}

function upsertEmployees(current: Employee[], drafts: EmployeeDraft[]): Employee[] {
  const employeesById = new Map(current.map((employee) => [employee.empleado, employee]));

  drafts.forEach((draft) => {
    const previous = employeesById.get(draft.empleado);
    const nextDraft = {
      ...draft,
      puestoEus: draft.puestoEus.trim() || previous?.puestoEus || '',
    };
    employeesById.set(draft.empleado, hydrateEmployee(nextDraft, previous?.deletedAt ?? null));
  });

  return Array.from(employeesById.values());
}

function firstVisibleEmployeeId(employees: Employee[]): string {
  return employees.find((employee) => !employee.deletedAt)?.empleado ?? '';
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  employees: mockEmployees,
  selectedEmployeeId: firstVisibleEmployeeId(mockEmployees),
  filters: EMPTY_EMPLOYEE_FILTERS,
  jobPositionTranslations: [],
  load: () => {
    const employees = readEmployees();
    const jobPositionTranslations = readJobPositionTranslations();
    set({ employees, jobPositionTranslations, selectedEmployeeId: firstVisibleEmployeeId(employees) });
  },
  save: () => persistEmployees(get().employees),
  create: (draft) => {
    set((state) => {
      const employees = upsertEmployees(state.employees, [draft]);
      persistEmployees(employees);
      return { employees, selectedEmployeeId: draft.empleado };
    });
  },
  update: (empleado, draft) => {
    set((state) => {
      const employees = state.employees.map((employee) =>
        employee.empleado === empleado ? hydrateEmployee(draft, employee.deletedAt) : employee,
      );
      persistEmployees(employees);
      return { employees, selectedEmployeeId: draft.empleado };
    });
  },
  remove: (empleado) => {
    set((state) => {
      const employees = state.employees.map((employee) =>
        employee.empleado === empleado ? { ...employee, deletedAt: new Date().toISOString() } : employee,
      );
      persistEmployees(employees);
      return { employees, selectedEmployeeId: firstVisibleEmployeeId(employees) };
    });
  },
  importExcel: async (file) => {
    const drafts = await importEmployeesFromFile(file);
    set((state) => {
      const employees = upsertEmployees(state.employees, drafts);
      persistEmployees(employees);
      return { employees, selectedEmployeeId: firstVisibleEmployeeId(employees) };
    });
  },
  importJobPositionTranslations: async (file) => {
    const importedTranslations = await importJobPositionTranslationsFromFile(file);
    set((state) => {
      const jobPositionTranslations = upsertJobPositionTranslations(
        state.jobPositionTranslations,
        importedTranslations,
      );
      persistJobPositionTranslations(jobPositionTranslations);
      return { jobPositionTranslations };
    });
    return importedTranslations.length;
  },
  updateEmptyEmployeeJobPositionTranslations: () => {
    const { employees, jobPositionTranslations } = get();
    let updated = 0;
    let missing = 0;

    const nextEmployees = employees.map((employee) => {
      if (employee.deletedAt || employee.puestoEus.trim()) {
        return employee;
      }

      const puestoEus = resolveEmployeeJobPositionTranslation(employee, jobPositionTranslations);
      if (!puestoEus) {
        missing += 1;
        return employee;
      }

      updated += 1;
      return { ...employee, puestoEus };
    });

    if (updated > 0) {
      persistEmployees(nextEmployees);
      set({ employees: nextEmployees });
    }

    return { updated, missing };
  },
  selectEmployee: (employeeId) => set({ selectedEmployeeId: employeeId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

export { filterEmployees };
export type { EmployeeFilters };
