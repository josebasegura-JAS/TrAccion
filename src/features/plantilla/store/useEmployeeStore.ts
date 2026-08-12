import { create } from 'zustand';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_FILTERS, filterEmployees, type EmployeeFilters } from '../domain/filters';
import { readEmployeeImportFromFile } from '../domain/importExcel';
import { importJobPositionTranslationsFromFile } from '../domain/importJobPositionTranslations';
import { normalizeJobPosition, type JobPositionTranslation } from '../domain/jobPositionTranslation';
import type { Employee, EmployeeDraft, EmployeeField } from '../domain/employee';
import { readStorageItem, writeJsonStorageAsync } from '../../../services/persistence';
import { saveNewSharedArrayRecord, saveSharedArrayRecord } from '../../../services/sharedRecordPersistence';
import {
  hasEmployeeSqliteBatchRepository,
  hasEmployeeSqliteRepository,
  loadEmployeesFromSqlite,
  saveEmployeesToSqlite,
  saveEmployeeToSqlite,
} from './employeeSqliteRepository';

export const EMPLOYEES_STORAGE_KEY = 'traccion.v1.plantilla.employees';
const STORAGE_KEY = EMPLOYEES_STORAGE_KEY;
const JOB_POSITION_TRANSLATIONS_STORAGE_KEY = 'traccion.v1.plantilla.jobPositionTranslations';

interface EmployeeImportResult {
  totalRows: number;
  updated: number;
  created: number;
  ignored: number;
  mode: 'full' | 'antiguedadPuesto';
}

interface EmployeeState {
  employees: Employee[];
  selectedEmployeeId: string;
  filters: EmployeeFilters;
  jobPositionTranslations: JobPositionTranslation[];
  isLoading: boolean;
  lastLoadedAt: number | null;
  load: () => void;
  reloadFromStorage: () => void;
  createWithConcurrencyCheck: (draft: EmployeeDraft) => Promise<{ ok: boolean; message: string; recordId?: string }>;
  updateWithConcurrencyCheck: (empleado: string, draft: EmployeeDraft, expectedSnapshot: string | null) => Promise<{ ok: boolean; message: string }>;
  removeWithConcurrencyCheck: (empleado: string, expectedSnapshot: string | null) => Promise<{ ok: boolean; message: string }>;
  importExcel: (file: File, columnMapping?: Array<EmployeeField | null>) => Promise<EmployeeImportResult>;
  importJobPositionTranslations: (file: File) => Promise<number>;
  createJobPositionTranslation: (translation: JobPositionTranslation) => Promise<{ ok: boolean; message: string }>;
  syncMissingJobPositionTranslationsFromEmployees: () => Promise<{ created: number; createdPuestos: string[] }>;
  updateJobPositionTranslation: (
    previousPuestoCastellano: string,
    translation: JobPositionTranslation,
  ) => Promise<{ ok: boolean; message: string }>;
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
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  if (!Array.isArray(parsed)) {
    return [];
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
    return [];
  }

  const parsed: unknown = JSON.parse(storageValue);
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.filter(isEmployee).map((employee) => hydrateEmployee(employee, employee.deletedAt));
}

function employeeSnapshot(employee: Employee): string {
  return JSON.stringify(employee);
}

function canonicalEmployeeSnapshot(employee: Employee): string {
  return JSON.stringify({
    empleado: employee.empleado,
    nombreApellidos: employee.nombreApellidos,
    puestoNomina: employee.puestoNomina,
    puestoOrganizativo: employee.puestoOrganizativo,
    puestoEus: employee.puestoEus,
    residencia: employee.residencia,
    unidad: employee.unidad,
    nivelRetributivo: employee.nivelRetributivo,
    direccionOrganizativa: employee.direccionOrganizativa,
    antiguedadPuesto: employee.antiguedadPuesto,
    sexo: employee.sexo,
    calle: employee.calle,
    numero: employee.numero,
    piso: employee.piso,
    codigoPostal: employee.codigoPostal,
    poblacion: employee.poblacion,
    provincia: employee.provincia,
    nif: employee.nif,
    dni: employee.dni,
    residenciaCast: employee.residenciaCast,
    residenciaEus: employee.residenciaEus,
    direccionTeletrabajo: employee.direccionTeletrabajo,
    deletedAt: employee.deletedAt,
  });
}

function employeeSnapshotFromStorageValue(storageValue: string | null): string | null {
  try {
    const employees = parseEmployeesSnapshot(storageValue ? `[${storageValue}]` : null);
    const employee = employees[0];
    return employee ? canonicalEmployeeSnapshot(employee) : null;
  } catch {
    return null;
  }
}

function areEmployeeStorageSnapshotsEquivalent(left: string | null, right: string | null): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return employeeSnapshotFromStorageValue(left) === employeeSnapshotFromStorageValue(right);
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
): Promise<{ ok: boolean; message: string; currentValue: string | null } | null> {
  if (!hasEmployeeSqliteRepository()) {
    return null;
  }

  const result = await saveEmployeeToSqlite(employee, expectedSnapshot);
  if (!result) {
    return null;
  }

  return { ok: result.ok, message: result.message, currentValue: result.currentValue };
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


function validateJobPositionTranslationDraft(
  translation: JobPositionTranslation,
): { ok: boolean; message: string; normalized: JobPositionTranslation } {
  const normalized = {
    puestoCastellano: translation.puestoCastellano.trim(),
    puestoEuskera: translation.puestoEuskera.trim(),
  };

  if (!normalized.puestoCastellano) {
    return { ok: false, message: 'Indica el nombre del puesto.', normalized };
  }

  if (!normalized.puestoEuskera) {
    return { ok: false, message: 'Indica la traducción del puesto.', normalized };
  }

  return { ok: true, message: '', normalized };
}

function sortJobPositionTranslations(
  translations: JobPositionTranslation[],
): JobPositionTranslation[] {
  return [...translations].sort((first, second) =>
    first.puestoCastellano.localeCompare(second.puestoCastellano, 'es', {
      numeric: true,
      sensitivity: 'base',
    }),
  );
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

  return sortJobPositionTranslations(Array.from(translationsByPosition.values()));
}


function resolveEmployeeJobPositionTranslation(
  employee: Pick<EmployeeDraft, 'puestoNomina' | 'puestoOrganizativo'>,
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

function isAntiguedadPuestoOnlyDraft(draft: EmployeeDraft): boolean {
  return Object.entries(draft).every(([field, value]) =>
    field === 'empleado' || field === 'antiguedadPuesto' ? true : value.trim() === '',
  );
}

function buildEmployeeImport(
  current: Employee[],
  drafts: EmployeeDraft[],
  importedFields: ReadonlySet<keyof EmployeeDraft>,
  translations: JobPositionTranslation[],
): { employees: Employee[]; changedEmployees: Employee[]; result: EmployeeImportResult } {
  const employeesById = new Map(current.map((employee) => [employee.empleado, employee]));
  const importedFieldNames = Array.from(importedFields);
  const isAntiguedadOnlyImport =
    drafts.length > 0 &&
    importedFields.has('empleado') &&
    importedFields.has('antiguedadPuesto') &&
    importedFieldNames.every((field) => field === 'empleado' || field === 'antiguedadPuesto') &&
    drafts.every(isAntiguedadPuestoOnlyDraft);
  const changedEmployees: Employee[] = [];
  let updated = 0;
  let created = 0;
  let ignored = 0;

  drafts.forEach((draft) => {
    const previous = employeesById.get(draft.empleado);

    if (isAntiguedadOnlyImport) {
      if (!previous || !draft.antiguedadPuesto.trim()) {
        ignored += 1;
        return;
      }

      const nextEmployee = {
        ...previous,
        antiguedadPuesto: draft.antiguedadPuesto,
      };
      employeesById.set(draft.empleado, nextEmployee);
      if (employeeSnapshot(nextEmployee) !== employeeSnapshot(previous)) {
        changedEmployees.push(nextEmployee);
      }
      updated += 1;
      return;
    }

    // La Excel es fuente de verdad únicamente para las columnas que realmente
    // trae. Las columnas ausentes conservan el dato ya guardado en Plantilla.
    // Esto evita que una importación parcial borre domicilio, NIF, nivel, etc.
    const nextDraft: EmployeeDraft = previous
      ? {
          empleado: previous.empleado,
          nombreApellidos: previous.nombreApellidos,
          puestoNomina: previous.puestoNomina,
          puestoOrganizativo: previous.puestoOrganizativo,
          puestoEus: previous.puestoEus,
          residencia: previous.residencia,
          unidad: previous.unidad,
          nivelRetributivo: previous.nivelRetributivo,
          direccionOrganizativa: previous.direccionOrganizativa,
          antiguedadPuesto: previous.antiguedadPuesto,
          sexo: previous.sexo,
          calle: previous.calle,
          numero: previous.numero,
          piso: previous.piso,
          codigoPostal: previous.codigoPostal,
          poblacion: previous.poblacion,
          provincia: previous.provincia,
          nif: previous.nif,
        }
      : { ...draft };

    importedFieldNames.forEach((field) => {
      nextDraft[field] = draft[field];
    });

    // Mantiene una traducción ya revisada si la columna Puesto EUS llega vacía.
    if (!nextDraft.puestoEus.trim() && previous?.puestoEus.trim()) {
      nextDraft.puestoEus = previous.puestoEus;
    }

    // Si ya existe equivalencia castellano/euskera, se aplica en la propia
    // importación: no hace falta ejecutar después "Actualizar puestos global".
    if (!nextDraft.puestoEus.trim()) {
      nextDraft.puestoEus = resolveEmployeeJobPositionTranslation(nextDraft, translations);
    }

    // Si una persona previamente eliminada vuelve a aparecer en la fuente
    // principal, se reactiva automáticamente.
    const nextEmployee = hydrateEmployee(nextDraft, null);
    employeesById.set(draft.empleado, nextEmployee);
    if (!previous || employeeSnapshot(nextEmployee) !== employeeSnapshot(previous)) {
      changedEmployees.push(nextEmployee);
    }

    if (previous) {
      updated += 1;
    } else {
      created += 1;
    }
  });

  return {
    employees: Array.from(employeesById.values()),
    changedEmployees,
    result: {
      totalRows: drafts.length,
      updated,
      created,
      ignored,
      mode: isAntiguedadOnlyImport ? 'antiguedadPuesto' : 'full',
    },
  };
}

function firstVisibleEmployeeId(employees: Employee[]): string {
  return employees.find((employee) => !employee.deletedAt)?.empleado ?? '';
}

function areEmployeesEquivalent(left: Employee[], right: Employee[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function areJobPositionTranslationsEquivalent(
  left: JobPositionTranslation[],
  right: JobPositionTranslation[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  employees: [],
  selectedEmployeeId: '',
  filters: EMPTY_EMPLOYEE_FILTERS,
  jobPositionTranslations: [],
  isLoading: false,
  lastLoadedAt: null,
  load: () => {
    const { isLoading, lastLoadedAt } = get();
    // Varios módulos (Teletrabajo, Sorteos, Licencias, Ticket Restaurante,
    // Vinculograma) llaman a load() al montar su página. Si el usuario
    // navega entre ellos en pocos segundos, el store ya tiene la plantilla
    // en memoria y no hace falta repetir la lectura a SQLite vía IPC: basta
    // con evitar duplicar una carga ya en curso o recién terminada. No es
    // un caché de larga duración — pasada esta ventana, load() vuelve a
    // leer con normalidad para no servir datos obsoletos.
    const EMPLOYEE_LOAD_DEDUP_WINDOW_MS = 3000;
    if (isLoading) {
      return;
    }
    if (lastLoadedAt !== null && Date.now() - lastLoadedAt < EMPLOYEE_LOAD_DEDUP_WINDOW_MS) {
      return;
    }

    set({ isLoading: true });
    void (async () => {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set({
        employees,
        jobPositionTranslations,
        selectedEmployeeId: firstVisibleEmployeeId(employees),
        isLoading: false,
        lastLoadedAt: Date.now(),
      });
    })().catch(() => set({ isLoading: false }));
  },
  reloadFromStorage: () => {
    void (async () => {
      const employees = await readEmployeesShared();
      const jobPositionTranslations = readJobPositionTranslations();
      set((state) => {
        const hasEmployeesChanged = !areEmployeesEquivalent(state.employees, employees);
        const hasTranslationsChanged = !areJobPositionTranslationsEquivalent(
          state.jobPositionTranslations,
          jobPositionTranslations,
        );

        if (!hasEmployeesChanged && !hasTranslationsChanged && !state.isLoading) {
          return { ...state, lastLoadedAt: Date.now() };
        }

        return {
          employees,
          jobPositionTranslations,
          selectedEmployeeId: employees.some((employee) => employee.empleado === state.selectedEmployeeId)
            ? state.selectedEmployeeId
            : firstVisibleEmployeeId(employees),
          isLoading: false,
          lastLoadedAt: Date.now(),
        };
      });
    })().catch(() => set({ isLoading: false }));
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
            if (areEmployeeStorageSnapshotsEquivalent(directResult.currentValue, expectedSnapshot)) {
              const retryResult = await persistEmployeeDirectOrFallback(updatedEmployee, directResult.currentValue);
              if (retryResult?.ok) {
                const employees = await readEmployeesShared();
                set({ employees, selectedEmployeeId: updatedEmployee.empleado });
                return { ok: true, message: retryResult.message };
              }
              return retryResult ?? directResult;
            }
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
            if (areEmployeeStorageSnapshotsEquivalent(directResult.currentValue, expectedSnapshot)) {
              const retryResult = await persistEmployeeDirectOrFallback(deletedEmployee, directResult.currentValue);
              if (retryResult?.ok) {
                const employees = await readEmployeesShared();
                set({ employees, selectedEmployeeId: firstVisibleEmployeeId(employees) });
                return { ok: true, message: retryResult.message };
              }
              return retryResult ?? directResult;
            }
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
  importExcel: async (file, columnMapping) => {
    const { drafts, importedFields } = await readEmployeeImportFromFile(file, columnMapping);
    if (!importedFields.includes('empleado')) {
      throw new Error('No se ha encontrado una columna de Empleado reconocible en el Excel.');
    }
    if (drafts.length === 0) {
      throw new Error('No se han encontrado personas válidas para importar.');
    }

    const currentEmployees = get().employees;
    const { employees, changedEmployees, result: importResult } = buildEmployeeImport(
      currentEmployees,
      drafts,
      new Set(importedFields),
      get().jobPositionTranslations,
    );
    if (hasEmployeeSqliteBatchRepository()) {
      const previousById = new Map(currentEmployees.map((employee) => [employee.empleado, employeeSnapshot(employee)]));
      const result = await saveEmployeesToSqlite(
        changedEmployees.map((employee) => ({
          employee,
          expectedValue: previousById.get(employee.empleado) ?? null,
        })),
      );
      if (result && !result.ok) {
        throw new Error(result.message);
      }
      const reloadedEmployees = await readEmployeesShared();
      set({ employees: reloadedEmployees, selectedEmployeeId: firstVisibleEmployeeId(reloadedEmployees) });
      return importResult;
    }

    if (hasEmployeeSqliteRepository()) {
      const previousById = new Map(currentEmployees.map((employee) => [employee.empleado, employeeSnapshot(employee)]));
      for (const employee of changedEmployees) {
        const expectedSnapshot = previousById.get(employee.empleado) ?? null;
        const result = await persistEmployeeDirectOrFallback(employee, expectedSnapshot);
        if (result && !result.ok) {
          throw new Error(result.message);
        }
      }
      const reloadedEmployees = await readEmployeesShared();
      set({ employees: reloadedEmployees, selectedEmployeeId: firstVisibleEmployeeId(reloadedEmployees) });
      return importResult;
    }

    await persistEmployeesConfirmed(employees);
    set({ employees, selectedEmployeeId: firstVisibleEmployeeId(employees) });
    return importResult;
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
  createJobPositionTranslation: async (translation) => {
    const validation = validateJobPositionTranslationDraft(translation);
    if (!validation.ok) {
      return { ok: false, message: validation.message };
    }

    const currentTranslations = get().jobPositionTranslations;
    const translationKey = normalizeJobPosition(validation.normalized.puestoCastellano);
    const alreadyExists = currentTranslations.some(
      (currentTranslation) =>
        normalizeJobPosition(currentTranslation.puestoCastellano) === translationKey,
    );

    if (alreadyExists) {
      return { ok: false, message: 'Ya existe un puesto con ese nombre.' };
    }

    const jobPositionTranslations = sortJobPositionTranslations([
      ...currentTranslations,
      validation.normalized,
    ]);
    await persistJobPositionTranslationsConfirmed(jobPositionTranslations);
    set({ jobPositionTranslations });
    return { ok: true, message: 'Puesto creado.' };
  },
  /**
   * Da de alta automáticamente, como pendientes (puestoEuskera vacío), los
   * puestoOrganizativo de empleados activos que todavía no tienen ninguna
   * fila equivalente en jobPositionTranslations. Pensado para llamarse al
   * abrir el modal de Traducción de puestos, así Joseba ve de inmediato qué
   * le falta traducir tras renombrar un puesto en Plantilla, sin tener que
   * darlo de alta a mano antes. Una sola escritura por lotes, no una por
   * puesto encontrado.
   */
  syncMissingJobPositionTranslationsFromEmployees: async () => {
    const { employees, jobPositionTranslations: currentTranslations } = get();
    const existingKeys = new Set(
      currentTranslations.map((translation) => normalizeJobPosition(translation.puestoCastellano)),
    );

    const pendingByKey = new Map<string, string>();
    employees
      .filter((employee) => !employee.deletedAt && employee.puestoOrganizativo.trim())
      .forEach((employee) => {
        const puesto = employee.puestoOrganizativo.trim();
        const key = normalizeJobPosition(puesto);
        if (!existingKeys.has(key) && !pendingByKey.has(key)) {
          pendingByKey.set(key, puesto);
        }
      });

    if (pendingByKey.size === 0) {
      return { created: 0, createdPuestos: [] };
    }

    const createdPuestos = Array.from(pendingByKey.values()).sort((first, second) =>
      first.localeCompare(second, 'es', { numeric: true, sensitivity: 'base' }),
    );
    const newTranslations: JobPositionTranslation[] = createdPuestos.map((puesto) => ({
      puestoCastellano: puesto,
      puestoEuskera: '',
    }));

    const jobPositionTranslations = sortJobPositionTranslations([
      ...currentTranslations,
      ...newTranslations,
    ]);
    await persistJobPositionTranslationsConfirmed(jobPositionTranslations);
    set({ jobPositionTranslations });
    return { created: createdPuestos.length, createdPuestos };
  },
  updateJobPositionTranslation: async (previousPuestoCastellano, translation) => {
    const validation = validateJobPositionTranslationDraft(translation);
    if (!validation.ok) {
      return { ok: false, message: validation.message };
    }

    const currentTranslations = get().jobPositionTranslations;
    const previousKey = normalizeJobPosition(previousPuestoCastellano);
    const nextKey = normalizeJobPosition(validation.normalized.puestoCastellano);
    const targetExists = currentTranslations.some(
      (currentTranslation) => normalizeJobPosition(currentTranslation.puestoCastellano) === previousKey,
    );

    if (!targetExists) {
      return { ok: false, message: 'El puesto ya no existe. Recarga antes de continuar.' };
    }

    const duplicated = currentTranslations.some((currentTranslation) => {
      const currentKey = normalizeJobPosition(currentTranslation.puestoCastellano);
      return currentKey !== previousKey && currentKey === nextKey;
    });

    if (duplicated) {
      return { ok: false, message: 'Ya existe otro puesto con ese nombre.' };
    }

    const jobPositionTranslations = sortJobPositionTranslations(
      currentTranslations.map((currentTranslation) =>
        normalizeJobPosition(currentTranslation.puestoCastellano) === previousKey
          ? validation.normalized
          : currentTranslation,
      ),
    );
    await persistJobPositionTranslationsConfirmed(jobPositionTranslations);
    set({ jobPositionTranslations });
    return { ok: true, message: 'Puesto actualizado.' };
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
