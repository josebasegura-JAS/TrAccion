import { create } from 'zustand';
import { mockEmployees } from '../../../data/mockEmployees';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_FILTERS, filterEmployees, type EmployeeFilters } from '../domain/filters';
import { importEmployeesFromFile } from '../domain/importExcel';
import { importJobPositionTranslationsFromFile } from '../domain/importJobPositionTranslations';
import { normalizeJobPosition, type JobPositionTranslation } from '../domain/jobPositionTranslation';
import type { Employee, EmployeeDraft } from '../domain/employee';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import { hasEmployeeSqliteRepository, loadEmployeesFromSqlite, saveEmployeeToSqlite } from './employeeSqliteRepository';

export const EMPLOYEES_STORAGE_KEY = 'traccion.v1.plantilla.employees';
const STORAGE_KEY = EMPLOYEES_STORAGE_KEY;
const JOB_POSITION_TRANSLATIONS_STORAGE_KEY = 'traccion.v1.plantilla.jobPositionTranslations';

interface EmployeeState {
  employees: Employee[];
  selectedEmployeeId: string;
  filters: EmployeeFilters;
  jobPositionTranslations: JobPositionTranslation[];
  load: () => void;
  reloadFromStorage: () => void;
  save: () => void;
  create: (draft: EmployeeDraft) => void;
  createWithConcurrencyCheck: (draft: EmployeeDraft) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  update: (empleado: string, draft: EmployeeDraft) => void;
  updateWithConcurrencyCheck: (empleado: string, draft: EmployeeDraft, expectedSnapshot: string | null) => Promise<{ ok: boolean; message: string }>;
  remove: (empleado: string) => void;
  removeWithConcurrencyCheck: (empleado: string, expectedSnapshot: string | null) => Promise<{ ok: boolean; message: string }>;
  importExcel: (file: File) => Promise<void>;
  importJobPositionTranslations: (file: File) => Promise<number>;
  updateEmptyEmployeeJobPositionTranslations: () => Promise<{ updated: number; missing: number }>;
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

async function readEmployeesShared(): Promise<Employee[]> {
  if (hasEmployeeSqliteRepository()) {
    const sqliteEmployees = await loadEmployeesFromSqlite(parseEmployeesSnapshot);
    if (sqliteEmployees) {
      return sqliteEmployees;
    }
  }

  return readEmployees();
}

function parseEmployeesSnapshot(storageValue: string | null): Employee[] {
  if (!storageValue) {
    return mockEmployees;
  }

  const parsed: unknown = JSON.parse(storageValue);
  if (!Array.isArray(parsed)) {
    return mockEmployees;
  }

  return parsed.filter(isEmployee).map((employee) => hydrateEmployee(employee, employee.deletedAt));
}

function employeeSnapshot(employee: Employee): string {
  return JSON.stringify(employee);
}

async function persistEmployeesConfirmed(employees: Employee[]): Promise<void> {
  const result = await writeJsonStorageAsync(STORAGE_KEY, employees);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

async function persistEmployeeDirectOrFallback(
  employee: Employee,
  expectedSnapshot: string | null,
): Promise<{ ok: boolean; message: string } | null> {
  if (!hasEmployeeSqliteRepository()) {
    return null;
  }

  const result = await saveEmployeeToSqlite(employee, expectedSnapshot);
  if (!result) {
    return null;
  }

  return { ok: result.ok, message: result.message };
}

async function persistEmployeesShared(
  employees: Employee[],
  previousEmployees: Employee[],
): Promise<Employee[]> {
  if (hasEmployeeSqliteRepository()) {
    const previousById = new Map(previousEmployees.map((employee) => [employee.empleado, employeeSnapshot(employee)]));
    for (const employee of employees) {
      const expectedSnapshot = previousById.get(employee.empleado) ?? null;
      const result = await persistEmployeeDirectOrFallback(employee, expectedSnapshot);
      if (result && !result.ok) {
        throw new Error(result.message);
      }
    }
    return readEmployeesShared();
  }

  await persistEmployeesConfirmed(employees);
  return employees;
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

async function persistJobPositionTranslationsConfirmed(
  translations: JobPositionTranslation[],
): Promise<void> {
  const result = await writeJsonStorageAsync(JOB_POSITION_TRANSLATIONS_STORAGE_KEY, translations);
  if (!result.ok) {
    throw new Error(result.message);
  }
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
    void (async () => {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set({ employees, jobPositionTranslations, selectedEmployeeId: firstVisibleEmployeeId(employees) });
    })();
  },
  reloadFromStorage: () => {
    void (async () => {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set((state) => ({
        employees,
        jobPositionTranslations,
        selectedEmployeeId: employees.some((employee) => employee.empleado === state.selectedEmployeeId)
          ? state.selectedEmployeeId
          : firstVisibleEmployeeId(employees),
      }));
    })();
  },
  save: () => {
    void persistEmployeesShared(get().employees, get().employees);
  },
  create: (draft) => {
    void (async () => {
      const currentEmployees = get().employees;
      const employees = upsertEmployees(currentEmployees, [draft]);
      const persistedEmployees = await persistEmployeesShared(employees, currentEmployees);
      set({ employees: persistedEmployees, selectedEmployeeId: draft.empleado });
    })();
  },
  createWithConcurrencyCheck: async (draft) => {
    try {
      const newEmployee = hydrateEmployee(draft, null);
      const directResult = await persistEmployeeDirectOrFallback(newEmployee, null);
      if (directResult) {
        if (!directResult.ok) {
          return directResult;
        }
        const employees = await readEmployeesShared();
        set({ employees, selectedEmployeeId: newEmployee.empleado });
        return { ok: true, message: directResult.message, recordId: newEmployee.empleado };
      }

      const result = await saveNewSharedArrayRecord<Employee>({
        storageKey: STORAGE_KEY,
        newRecord: newEmployee,
        parseRecords: parseEmployeesSnapshot,
        getRecordId: (employee) => employee.empleado,
        duplicateMessage: 'La persona ya existe en la base compartida. Recarga antes de continuar.',
      });
      set({ employees: result.records, selectedEmployeeId: result.newRecord.empleado });
      return { ok: true, message: 'Persona creada.', recordId: result.newRecord.empleado };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido crear la persona.' };
    }
  },
  update: (empleado, draft) => {
    void (async () => {
      const currentEmployees = get().employees;
      const employees = currentEmployees.map((employee) =>
        employee.empleado === empleado ? hydrateEmployee(draft, employee.deletedAt) : employee,
      );
      const persistedEmployees = await persistEmployeesShared(employees, currentEmployees);
      set({ employees: persistedEmployees, selectedEmployeeId: draft.empleado });
    })();
  },
  updateWithConcurrencyCheck: async (empleado, draft, expectedSnapshot) => {
    try {
      if (hasEmployeeSqliteRepository()) {
        if (draft.empleado !== empleado) {
          return { ok: false, message: 'No se puede cambiar el número de empleado porque es el identificador compartido. Crea una persona nueva si el número ha cambiado.' };
        }
        const latestEmployees = await readEmployeesShared();
        const latestEmployee = latestEmployees.find((employee) => employee.empleado === empleado);
        if (!latestEmployee) {
          return { ok: false, message: 'La persona ya no existe en la base compartida. Recarga antes de continuar.' };
        }
        const updatedEmployee = hydrateEmployee(draft, latestEmployee.deletedAt);
        const directResult = await persistEmployeeDirectOrFallback(updatedEmployee, expectedSnapshot);
        if (directResult) {
          if (!directResult.ok) {
            return directResult;
          }
          const employees = await readEmployeesShared();
          set({ employees, selectedEmployeeId: updatedEmployee.empleado });
          return { ok: true, message: directResult.message };
        }
      }

      const result = await saveSharedArrayRecord<Employee>({
        storageKey: STORAGE_KEY,
        recordId: empleado,
        expectedUpdatedAt: expectedSnapshot,
        parseRecords: parseEmployeesSnapshot,
        getRecordId: (employee) => employee.empleado,
        getRecordUpdatedAt: employeeSnapshot,
        updateRecord: (latestEmployee) => hydrateEmployee(draft, latestEmployee.deletedAt),
        missingMessage: 'La persona ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ employees: result.records, selectedEmployeeId: result.updatedRecord.empleado });
      return { ok: true, message: 'Persona guardada.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido guardar la persona.' };
    }
  },
  remove: (empleado) => {
    void (async () => {
      const currentEmployees = get().employees;
      const employees = currentEmployees.map((employee) =>
        employee.empleado === empleado ? { ...employee, deletedAt: new Date().toISOString() } : employee,
      );
      const persistedEmployees = await persistEmployeesShared(employees, currentEmployees);
      set({ employees: persistedEmployees, selectedEmployeeId: firstVisibleEmployeeId(persistedEmployees) });
    })();
  },
  removeWithConcurrencyCheck: async (empleado, expectedSnapshot) => {
    try {
      const deletedAt = new Date().toISOString();
      if (hasEmployeeSqliteRepository()) {
        const latestEmployees = await readEmployeesShared();
        const latestEmployee = latestEmployees.find((employee) => employee.empleado === empleado);
        if (!latestEmployee) {
          return { ok: false, message: 'La persona ya no existe en la base compartida. Recarga antes de continuar.' };
        }
        const deletedEmployee = { ...latestEmployee, deletedAt };
        const directResult = await persistEmployeeDirectOrFallback(deletedEmployee, expectedSnapshot);
        if (directResult) {
          if (!directResult.ok) {
            return directResult;
          }
          const employees = await readEmployeesShared();
          set({ employees, selectedEmployeeId: firstVisibleEmployeeId(employees) });
          return { ok: true, message: directResult.message };
        }
      }

      const result = await saveSharedArrayRecord<Employee>({
        storageKey: STORAGE_KEY,
        recordId: empleado,
        expectedUpdatedAt: expectedSnapshot,
        parseRecords: parseEmployeesSnapshot,
        getRecordId: (employee) => employee.empleado,
        getRecordUpdatedAt: employeeSnapshot,
        updateRecord: (latestEmployee) => ({ ...latestEmployee, deletedAt }),
        missingMessage: 'La persona ya no existe en la base compartida. Recarga antes de continuar.',
        conflictMessage: 'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      });
      set({ employees: result.records, selectedEmployeeId: firstVisibleEmployeeId(result.records) });
      return { ok: true, message: 'Persona eliminada.' };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'No se ha podido eliminar la persona.' };
    }
  },
  importExcel: async (file) => {
    const drafts = await importEmployeesFromFile(file);
    const currentEmployees = get().employees;
    const employees = upsertEmployees(currentEmployees, drafts);
    if (hasEmployeeSqliteRepository()) {
      const previousById = new Map(currentEmployees.map((employee) => [employee.empleado, employeeSnapshot(employee)]));
      for (const employee of employees) {
        const expectedSnapshot = previousById.get(employee.empleado) ?? null;
        const result = await persistEmployeeDirectOrFallback(employee, expectedSnapshot);
        if (result && !result.ok) {
          throw new Error(result.message);
        }
      }
      const reloadedEmployees = await readEmployeesShared();
      set({ employees: reloadedEmployees, selectedEmployeeId: firstVisibleEmployeeId(reloadedEmployees) });
      return;
    }

    await persistEmployeesConfirmed(employees);
    set({ employees, selectedEmployeeId: firstVisibleEmployeeId(employees) });
  },
  importJobPositionTranslations: async (file) => {
    const importedTranslations = await importJobPositionTranslationsFromFile(file);
    const jobPositionTranslations = upsertJobPositionTranslations(
      get().jobPositionTranslations,
      importedTranslations,
    );
    await persistJobPositionTranslationsConfirmed(jobPositionTranslations);
    set({ jobPositionTranslations });
    return importedTranslations.length;
  },
  updateEmptyEmployeeJobPositionTranslations: async () => {
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
      const persistedEmployees = await persistEmployeesShared(nextEmployees, employees);
      set({ employees: persistedEmployees });
    }

    return { updated, missing };
  },
  selectEmployee: (employeeId) => set({ selectedEmployeeId: employeeId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));

export { filterEmployees };
export type { EmployeeFilters };
