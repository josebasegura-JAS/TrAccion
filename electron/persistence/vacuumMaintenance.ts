import { stat } from 'node:fs/promises';
import type { Database } from 'better-sqlite3';
import { computeHeaviestTables, type TableSizeBreakdownEntry } from './maintenanceQueries.js';
import type { DatabaseLockInfo, DatabaseStatus } from '../sqlitePersistence.js';

const VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const VACUUM_LOCK_WAIT_MS = 30 * 1000;
const VACUUM_METADATA_KEY = 'last_vacuum_at';

export interface VacuumResult {
  ok: boolean;
  message: string;
  sizeBeforeBytes: number | null;
  sizeAfterBytes: number | null;
  durationMs: number | null;
}

export interface VacuumStatus {
  lastVacuumAt: string | null;
  currentSizeBytes: number | null;
  heaviestTables: TableSizeBreakdownEntry[];
}

export interface VacuumMaintenanceDependencies {
  getDatabase: () => Database | null;
  getStatus: () => DatabaseStatus;
  acquireLock: (databasePath: string, waitMs?: number) => Promise<DatabaseLockInfo>;
  releaseLock: (lockPath: string, lock: DatabaseLockInfo) => Promise<void>;
  getLockPath: (databasePath: string) => string;
  startDatabaseLockHeartbeat: (lockPath: string, lock: DatabaseLockInfo) => ReturnType<typeof setInterval>;
  isLockContentionError: (error: unknown) => boolean;
}

/**
 * Ejecuta VACUUM sobre la base SQLite activa, reescribiendo el archivo completo
 * para liberar espacio en disco y actualizando estadísticas con ANALYZE.
 */
export async function vacuumDatabase(
  dependencies: VacuumMaintenanceDependencies,
  reason: string,
): Promise<VacuumResult> {
  const currentDatabase = dependencies.getDatabase();
  const currentStatus = dependencies.getStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return {
      ok: false,
      message: 'La base de datos no está activa; no se ha podido compactar.',
      sizeBeforeBytes: null,
      sizeAfterBytes: null,
      durationMs: null,
    };
  }

  let vacuumLock: DatabaseLockInfo;
  try {
    vacuumLock = await dependencies.acquireLock(currentStatus.path, VACUUM_LOCK_WAIT_MS);
  } catch (error) {
    if (dependencies.isLockContentionError(error)) {
      return {
        ok: false,
        message: 'La base de datos está ocupada por otro equipo; inténtalo de nuevo en unos minutos.',
        sizeBeforeBytes: null,
        sizeAfterBytes: null,
        durationMs: null,
      };
    }
    throw error;
  }

  const vacuumLockPath = dependencies.getLockPath(currentStatus.path);
  const vacuumLockHeartbeat = dependencies.startDatabaseLockHeartbeat(vacuumLockPath, vacuumLock);

  try {
    const sizeBeforeBytes = (await stat(currentStatus.path).catch(() => null))?.size ?? null;
    const startedAt = Date.now();

    currentDatabase.exec('VACUUM');
    currentDatabase.exec('ANALYZE');

    const durationMs = Date.now() - startedAt;
    const sizeAfterBytes = (await stat(currentStatus.path).catch(() => null))?.size ?? null;
    const completedAt = new Date().toISOString();
    writeLastVacuumAt(currentDatabase, completedAt);

    console.info(`VACUUM + ANALYZE SQLite completado (${reason}) en ${durationMs} ms.`);
    return {
      ok: true,
      message: 'Base de datos compactada y optimizada correctamente.',
      sizeBeforeBytes,
      sizeAfterBytes,
      durationMs,
    };
  } catch (error) {
    console.warn('No se ha podido compactar la base de datos SQLite (VACUUM).', error);
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido compactar la base de datos.',
      sizeBeforeBytes: null,
      sizeAfterBytes: null,
      durationMs: null,
    };
  } finally {
    clearInterval(vacuumLockHeartbeat);
    await dependencies.releaseLock(vacuumLockPath, vacuumLock).catch((error: unknown) => {
      console.warn('No se ha podido liberar el bloqueo SQLite de compactado.', error);
    });
  }
}

/**
 * Lanza VACUUM en segundo plano si ha pasado el intervalo programado desde el
 * último compactado. Pensado para el cierre de la app.
 */
export async function runScheduledVacuumIfDue(dependencies: VacuumMaintenanceDependencies): Promise<void> {
  const currentDatabase = dependencies.getDatabase();
  const currentStatus = dependencies.getStatus();
  if (!currentDatabase || !currentStatus.ready || currentStatus.phase !== 'active') {
    return;
  }

  const lastVacuumAt = readLastVacuumAt(currentDatabase);
  const lastVacuumTime = lastVacuumAt ? new Date(lastVacuumAt).getTime() : null;
  const isDue =
    lastVacuumTime === null || Number.isNaN(lastVacuumTime) || Date.now() - lastVacuumTime >= VACUUM_INTERVAL_MS;

  if (!isDue) {
    return;
  }

  await vacuumDatabase(dependencies, 'scheduled');
}

export async function getVacuumStatus(dependencies: VacuumMaintenanceDependencies): Promise<VacuumStatus> {
  const currentDatabase = dependencies.getDatabase();
  const currentStatus = dependencies.getStatus();
  const lastVacuumAt = currentDatabase && currentStatus.ready ? readLastVacuumAt(currentDatabase) : null;
  const currentSizeBytes = currentStatus.ready
    ? (await stat(currentStatus.path).catch(() => null))?.size ?? null
    : null;
  const heaviestTables = currentDatabase && currentStatus.ready ? computeHeaviestTables(currentDatabase) : [];

  return { lastVacuumAt, currentSizeBytes, heaviestTables };
}

function readLastVacuumAt(db: Database): string | null {
  const row = db.prepare(`SELECT value FROM app_metadata WHERE key = '${VACUUM_METADATA_KEY}'`).get();
  return isMetadataRow(row) ? row.value : null;
}

function writeLastVacuumAt(db: Database, timestamp: string): void {
  db.prepare(
    `INSERT INTO app_metadata (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(VACUUM_METADATA_KEY, timestamp, timestamp);
}

function isMetadataRow(row: unknown): row is { value: string } {
  return Boolean(row) && typeof row === 'object' && typeof (row as { value?: unknown }).value === 'string';
}
