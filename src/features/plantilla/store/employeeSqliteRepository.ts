import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../../services/persistence';
import type { Employee } from '../domain/employee';

const EMPLOYEES_DIRECT_STORAGE_KEY = 'traccion.v1.plantilla.employees';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function isTemporarySqliteBusyError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('base ocupada') ||
    message.includes('bloqueo temporal') ||
    message.includes('sqlite_busy') ||
    message.includes('database is locked') ||
    message.includes('temporarily unavailable')
  );
}

async function withTemporarySqliteRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= TEMPORARY_SQLITE_BUSY_RETRIES; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTemporarySqliteBusyError(error) || attempt === TEMPORARY_SQLITE_BUSY_RETRIES) {
        break;
      }
      await delay(TEMPORARY_SQLITE_BUSY_RETRY_MS * (attempt + 1));
    }
  }

  throw lastError;
}

export interface EmployeeSqliteSaveResult {
  ok: boolean;
  message: string;
  currentValue: string | null;
}

export function hasEmployeeSqliteRepository(): boolean {
  return Boolean(window.traccion?.loadEmployeeRecords && window.traccion?.saveEmployeeRecordIfUnchanged);
}

export async function loadEmployeesFromSqlite(
  parseEmployees: (storageValue: string | null) => Employee[],
): Promise<Employee[] | null> {
  const loader = window.traccion?.loadEmployeeRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  return snapshot.records.flatMap((record) => parseEmployees(`[${record.value}]`));
}

export async function saveEmployeeToSqlite(
  employee: Employee,
  expectedValue: string | null,
): Promise<EmployeeSqliteSaveResult | null> {
  const saver = window.traccion?.saveEmployeeRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, 'Guardando persona en SQLite…');
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver({
        id: employee.empleado,
        value: JSON.stringify(employee),
        expectedValue,
      }),
    );

    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      currentValue: result.currentValue,
    };
  } catch (error) {
    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, 'No se ha podido guardar la persona en SQLite.');
    throw error;
  }
}
