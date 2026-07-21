import { clearPersistenceBusy, publishPersistenceBusy, waitForNextPaint } from '../../../services/persistence';
import {
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from '../../../services/pendingRecordWrites';
import type { Employee } from '../domain/employee';

const EMPLOYEES_DIRECT_STORAGE_KEY = 'traccion.v1.plantilla.employees';
const EMPLOYEES_PENDING_WRITE_MODULE = 'plantilla-empleados';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

// Nota: a diferencia del resto de módulos, Plantilla usa expectedValue/currentValue
// (compara el JSON completo del registro anterior) en vez de expectedUpdatedAt.
// La cola genérica solo conoce "expectedUpdatedAt", así que aquí ese campo se
// reutiliza para llevar el expectedValue — el nombre no importa para la cola,
// que lo trata como un token opaco a comparar en el replay.
registerPendingWriteReplayer(EMPLOYEES_PENDING_WRITE_MODULE, async (recordId, value, expectedValue) => {
  const saver = window.traccion?.saveEmployeeRecordIfUnchanged;
  if (!saver) {
    return null;
  }

  const result = await saver({ id: recordId, value, expectedValue });
  return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentValue };
});

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
      await delay(Math.min(TEMPORARY_SQLITE_BUSY_RETRY_MS * (2 ** attempt) + Math.trunc(Math.random() * 100), 3000));
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

export function hasEmployeeSqliteBatchRepository(): boolean {
  return Boolean(window.traccion?.loadEmployeeRecords && window.traccion?.saveEmployeeRecordsIfUnchanged);
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

  const value = JSON.stringify(employee);

  try {
    const result = await saveRecordWithPendingFallback({
      module: EMPLOYEES_PENDING_WRITE_MODULE,
      recordId: employee.empleado,
      value,
      expectedUpdatedAt: expectedValue,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({ id: employee.empleado, value, expectedValue }),
        );
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentValue };
      },
    });

    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, result.message);

    return { ok: result.ok, message: result.message, currentValue: result.currentUpdatedAt };
  } catch (error) {
    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, 'No se ha podido guardar la persona en SQLite.');
    throw error;
  }
}

// Importación masiva (Excel): deliberadamente fuera de la cola de
// pendientes, mismo motivo que en saveActaTypesToSqlite.
export async function saveEmployeesToSqlite(
  employees: Array<{ employee: Employee; expectedValue: string | null }>,
): Promise<{ ok: boolean; message: string; saved: number } | null> {
  const saver = window.traccion?.saveEmployeeRecordsIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, `Importando ${employees.length} personas en SQLite…`);
  await waitForNextPaint();

  try {
    const result = await withTemporarySqliteRetry(() =>
      saver(
        employees.map(({ employee, expectedValue }) => ({
          id: employee.empleado,
          value: JSON.stringify(employee),
          expectedValue,
        })),
      ),
    );

    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, result.message);

    return {
      ok: result.ok,
      message: result.message,
      saved: result.saved,
    };
  } catch (error) {
    clearPersistenceBusy(EMPLOYEES_DIRECT_STORAGE_KEY, 'No se ha podido importar la plantilla en SQLite.');
    throw error;
  }
}
