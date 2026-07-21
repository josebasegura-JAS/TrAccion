import {
  clearPersistenceBusy,
  publishPersistenceBusy,
  waitForNextPaint,
} from '../../../services/persistence';
import { publishDatabaseStatus } from '../../../services/databaseStatus';
import {
  registerPendingWriteReplayer,
  saveRecordWithPendingFallback,
} from '../../../services/pendingRecordWrites';
import type { BudgetActual, BudgetManualItem, BudgetScenario, BudgetTicketGroup } from '../domain/presupuestos';

const PRESUPUESTOS_STORAGE_KEY = 'traccion.v1.presupuestos';
const PRESUPUESTOS_PENDING_WRITE_MODULE = 'presupuestos';
// Presupuestos guarda las 4 colecciones como un único snapshot atómico, no
// registro a registro, así que a efectos de la cola de pendientes se trata
// como un solo "registro" con id fijo.
const PRESUPUESTOS_SNAPSHOT_RECORD_ID = 'snapshot';
const TEMPORARY_SQLITE_BUSY_RETRIES = 6;
const TEMPORARY_SQLITE_BUSY_RETRY_MS = 250;

interface PresupuestosSnapshotPayload {
  scenarios: BudgetScenario[];
  manualItems: BudgetManualItem[];
  ticketGroups: BudgetTicketGroup[];
  actuals: BudgetActual[];
}

registerPendingWriteReplayer(PRESUPUESTOS_PENDING_WRITE_MODULE, async (_recordId, value, expectedUpdatedAt) => {
  const saver = window.traccion?.savePresupuestosSnapshotIfUnchanged;
  if (!saver) {
    return null;
  }

  const snapshot = JSON.parse(value) as PresupuestosSnapshotPayload;
  const result = await saver({
    scenarios: snapshot.scenarios.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
    manualItems: snapshot.manualItems.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
    ticketGroups: snapshot.ticketGroups.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
    actuals: snapshot.actuals.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
    expectedUpdatedAt,
  });
  publishDatabaseStatus(result.status);
  return { ok: result.ok, message: result.message, currentUpdatedAt: result.currentUpdatedAt };
});

export interface PresupuestosSqliteState {
  scenarios: BudgetScenario[];
  manualItems: BudgetManualItem[];
  ticketGroups: BudgetTicketGroup[];
  actuals: BudgetActual[];
  updatedAt: string | null;
}

export interface PresupuestosSqliteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

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
      await delay(
        Math.min(
          TEMPORARY_SQLITE_BUSY_RETRY_MS * 2 ** attempt + Math.trunc(Math.random() * 100),
          3000,
        ),
      );
    }
  }

  throw lastError;
}

function parseRecord<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseRecords<T>(records: Array<{ value: string }>): T[] {
  return records.flatMap((record) => {
    const parsed = parseRecord<T>(record.value);
    return parsed ? [parsed] : [];
  });
}

export function hasPresupuestosSqliteRepository(): boolean {
  return Boolean(
    window.traccion?.loadPresupuestosRecords &&
      window.traccion?.savePresupuestosSnapshotIfUnchanged,
  );
}

export async function loadPresupuestosFromSqlite(): Promise<PresupuestosSqliteState | null> {
  const loader = window.traccion?.loadPresupuestosRecords;
  if (!loader) {
    return null;
  }

  const snapshot = await withTemporarySqliteRetry(() => loader());
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    return null;
  }

  const latestUpdatedAt = [
    ...snapshot.scenarios,
    ...snapshot.manualItems,
    ...snapshot.ticketGroups,
    ...snapshot.actuals,
  ].reduce<string | null>((latest, record) => {
    if (!latest || record.updatedAt > latest) {
      return record.updatedAt;
    }
    return latest;
  }, null);

  return {
    scenarios: parseRecords<BudgetScenario>(snapshot.scenarios),
    manualItems: parseRecords<BudgetManualItem>(snapshot.manualItems),
    ticketGroups: parseRecords<BudgetTicketGroup>(snapshot.ticketGroups),
    actuals: parseRecords<BudgetActual>(snapshot.actuals),
    updatedAt: latestUpdatedAt,
  };
}

export async function savePresupuestosToSqlite(
  state: Pick<PresupuestosSqliteState, 'scenarios' | 'manualItems' | 'ticketGroups' | 'actuals'>,
  expectedUpdatedAt: string | null,
): Promise<PresupuestosSqliteSaveResult | null> {
  const saver = window.traccion?.savePresupuestosSnapshotIfUnchanged;
  if (!saver) {
    return null;
  }

  publishPersistenceBusy(PRESUPUESTOS_STORAGE_KEY, 'Guardando presupuestos en SQLite…');
  await waitForNextPaint();

  const value = JSON.stringify(state);

  try {
    const result = await saveRecordWithPendingFallback({
      module: PRESUPUESTOS_PENDING_WRITE_MODULE,
      recordId: PRESUPUESTOS_SNAPSHOT_RECORD_ID,
      value,
      expectedUpdatedAt,
      save: async () => {
        const rawResult = await withTemporarySqliteRetry(() =>
          saver({
            scenarios: state.scenarios.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
            manualItems: state.manualItems.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
            ticketGroups: state.ticketGroups.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
            actuals: state.actuals.map((item) => ({ id: item.id, value: JSON.stringify(item) })),
            expectedUpdatedAt,
          }),
        );
        publishDatabaseStatus(rawResult.status);
        return { ok: rawResult.ok, message: rawResult.message, currentUpdatedAt: rawResult.currentUpdatedAt };
      },
    });

    clearPersistenceBusy(PRESUPUESTOS_STORAGE_KEY, result.message);

    return result;
  } catch (error) {
    clearPersistenceBusy(PRESUPUESTOS_STORAGE_KEY, 'No se han podido guardar los presupuestos en SQLite.');
    throw error;
  }
}
