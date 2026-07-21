import { SQLITE_PENDING_RECORD_WRITES_KEY } from './persistenceKeys';
import { emitPersistenceFeedback, isTemporarySqliteLockMessage } from './persistence';

/**
 * Cola de escrituras pendientes para el patrón `<modulo>SqliteRepository.ts`
 * (`saveXToSqlite(record, expectedUpdatedAt)`), que es el que usan hoy los
 * 12+ módulos migrados según `ARCHITECTURE.md` §2.
 *
 * Es hermana de la cola de `persistence.ts` (`SQLITE_PENDING_WRITES_KEY`),
 * no un reemplazo: esa sigue protegiendo el camino genérico `writeStorageItem`
 * (usado hoy sobre todo para copias espejo, no para el guardado real de la
 * mayoría de módulos). Esta cubre el camino que sí usa la mayoría de guardados
 * reales — que hasta ahora no tenía ninguna red de seguridad ante una caída
 * de conectividad SMB a media sesión: la escritura fallaba y punto.
 *
 * Cada repositorio de módulo debe:
 * 1. Registrarse una vez con `registerPendingWriteReplayer(module, replayer)`.
 * 2. Envolver su función de guardado real con `saveRecordWithPendingFallback`.
 *
 * Ver `docs/ARCHITECTURE.md` §2 y `docs/DECISIONS.md` para el porqué.
 */

export interface PendingRecordWriteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export interface PendingRecordWriteResult extends PendingRecordWriteSaveResult {
  /** true si el fallo fue de conectividad y el cambio ha quedado encolado para reintento automático. */
  queued?: boolean;
}

interface PendingRecordWrite {
  module: string;
  recordId: string;
  value: string;
  expectedUpdatedAt: string | null;
  queuedAt: string;
  attempts: number;
  lastError: string | null;
}

type PendingWriteReplayer = (
  recordId: string,
  value: string,
  expectedUpdatedAt: string | null,
) => Promise<PendingRecordWriteSaveResult | null>;

const MAX_PENDING_RECORD_WRITE_ATTEMPTS = 20;

const pendingWriteReplayers = new Map<string, PendingWriteReplayer>();

/**
 * Cada `<modulo>SqliteRepository.ts` llama a esto una vez, al importarse, con
 * la misma función de guardado que ya usa (sin pasar por
 * `saveRecordWithPendingFallback`, para no re-encolar sobre sí misma).
 */
export function registerPendingWriteReplayer(module: string, replayer: PendingWriteReplayer): void {
  pendingWriteReplayers.set(module, replayer);
}

function isPendingRecordWrite(value: unknown): value is PendingRecordWrite {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PendingRecordWrite>;
  return (
    typeof candidate.module === 'string' &&
    typeof candidate.recordId === 'string' &&
    typeof candidate.value === 'string' &&
    typeof candidate.queuedAt === 'string' &&
    (typeof candidate.expectedUpdatedAt === 'string' || candidate.expectedUpdatedAt === null) &&
    typeof candidate.attempts === 'number' &&
    Number.isFinite(candidate.attempts) &&
    (typeof candidate.lastError === 'string' || candidate.lastError === null)
  );
}

function readPendingRecordWrites(): PendingRecordWrite[] {
  const stored = window.localStorage.getItem(SQLITE_PENDING_RECORD_WRITES_KEY);
  if (!stored) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isPendingRecordWrite) : [];
  } catch {
    return [];
  }
}

function writePendingRecordWrites(writes: PendingRecordWrite[]): void {
  if (writes.length === 0) {
    window.localStorage.removeItem(SQLITE_PENDING_RECORD_WRITES_KEY);
    return;
  }

  window.localStorage.setItem(SQLITE_PENDING_RECORD_WRITES_KEY, JSON.stringify(writes));
}

function pendingWriteKey(module: string, recordId: string): string {
  return `${module}:${recordId}`;
}

/**
 * Frases que identifican un fallo de *conectividad* (SMB caído, heartbeat
 * bloqueado, base ocupada momentáneamente) — las únicas que se encolan para
 * reintento automático. Cualquier otro rechazo (conflicto OCC real,
 * validación, etc.) se deja pasar tal cual: reintentarlo a ciegas más tarde
 * podría pisar un cambio de otro usuario sin que nadie lo revise.
 */
function isConnectivityFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    isTemporarySqliteLockMessage(message) ||
    normalized.includes('no está activo') ||
    normalized.includes('no se permite guardar sin base compartida') ||
    normalized.includes('bloquean nuevas escrituras') ||
    normalized.includes('sqlite_busy') ||
    normalized.includes('database is locked') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('no disponible')
  );
}

function upsertPendingRecordWrite(
  module: string,
  recordId: string,
  value: string,
  expectedUpdatedAt: string | null,
  lastError: string,
): void {
  const writes = readPendingRecordWrites();
  const existingIndex = writes.findIndex(
    (write) => write.module === module && write.recordId === recordId,
  );
  const attempts = existingIndex >= 0 ? writes[existingIndex].attempts + 1 : 1;

  if (attempts > MAX_PENDING_RECORD_WRITE_ATTEMPTS) {
    const discardMessage = `No se ha podido sincronizar un cambio de "${module}" tras ${attempts} intentos y se ha descartado. Revisa y vuelve a aplicar el cambio si sigue siendo necesario. Registro: ${recordId}.`;
    console.warn(
      `[pending-record-writes] Descartando write pendiente tras ${attempts} intentos fallidos. Módulo: ${module}. Registro: ${recordId}. Último error: ${lastError}`,
    );
    emitPersistenceFeedback({
      kind: 'error',
      updatedAt: new Date().toISOString(),
      key: pendingWriteKey(module, recordId),
      message: discardMessage,
    });
    if (existingIndex >= 0) {
      writes.splice(existingIndex, 1);
      writePendingRecordWrites(writes);
    }
    return;
  }

  const nextWrite: PendingRecordWrite = {
    module,
    recordId,
    value,
    expectedUpdatedAt,
    queuedAt: existingIndex >= 0 ? writes[existingIndex].queuedAt : new Date().toISOString(),
    attempts,
    lastError,
  };

  if (existingIndex >= 0) {
    writes[existingIndex] = nextWrite;
  } else {
    writes.push(nextWrite);
  }

  writePendingRecordWrites(writes);
}

function removePendingRecordWrite(module: string, recordId: string): void {
  const writes = readPendingRecordWrites().filter(
    (write) => !(write.module === module && write.recordId === recordId),
  );
  writePendingRecordWrites(writes);
}

export function getPendingRecordWriteCount(): number {
  return readPendingRecordWrites().length;
}

export interface SaveRecordWithPendingFallbackOptions {
  /** Nombre estable del módulo, el mismo pasado a `registerPendingWriteReplayer` (p.ej. 'tasks', 'licencias-sin-sueldo'). */
  module: string;
  recordId: string;
  value: string;
  expectedUpdatedAt: string | null;
  /** La llamada de guardado real del repositorio (p.ej. `() => window.traccion.saveTaskRecordIfUnchanged({...})`). */
  save: () => Promise<PendingRecordWriteSaveResult | null>;
}

/**
 * Envuelve la función de guardado de un repositorio de módulo. Si el fallo es
 * de conectividad, encola el cambio en localStorage para reintento automático
 * (al reconectar o en el siguiente ciclo de polling) en vez de descartarlo.
 * Si es un rechazo real (conflicto OCC, etc.) no se encola: se devuelve tal
 * cual para que el módulo lo muestre como hoy.
 */
export async function saveRecordWithPendingFallback({
  module,
  recordId,
  value,
  expectedUpdatedAt,
  save,
}: SaveRecordWithPendingFallbackOptions): Promise<PendingRecordWriteResult> {
  try {
    const result = await save();

    if (result === null) {
      return {
        ok: false,
        message: 'Repositorio SQLite no disponible.',
        currentUpdatedAt: null,
      };
    }

    if (result.ok) {
      removePendingRecordWrite(module, recordId);
      return result;
    }

    if (isConnectivityFailureMessage(result.message)) {
      upsertPendingRecordWrite(module, recordId, value, expectedUpdatedAt, result.message);
      return {
        ...result,
        message: `${result.message} El cambio ha quedado en cola local y se sincronizará automáticamente en cuanto vuelva la conexión con SQLite.`,
        queued: true,
      };
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de conexión con SQLite.';
    upsertPendingRecordWrite(module, recordId, value, expectedUpdatedAt, message);
    return {
      ok: false,
      message: `${message} El cambio ha quedado en cola local y se sincronizará automáticamente en cuanto vuelva la conexión con SQLite.`,
      currentUpdatedAt: null,
      queued: true,
    };
  }
}

/**
 * Reintenta todas las escrituras pendientes contra su módulo registrado.
 * Igual que `flushPendingSqliteWrites` en `persistence.ts`: en paralelo (la
 * cola FIFO de `enqueueSqliteIpc` en el proceso principal serializa de
 * verdad), en orden de encolado, re-encolando lo que vuelva a fallar.
 */
export async function flushPendingRecordWrites(): Promise<number> {
  const pendingWrites = readPendingRecordWrites();
  if (pendingWrites.length === 0) {
    return 0;
  }

  const sorted = [...pendingWrites].sort(
    (left, right) => Date.parse(left.queuedAt) - Date.parse(right.queuedAt),
  );

  const results = await Promise.allSettled(
    sorted.map(async (pendingWrite) => {
      const replayer = pendingWriteReplayers.get(pendingWrite.module);
      if (!replayer) {
        // Puede pasar si un módulo se elimina o renombra sin migrar su cola.
        throw new Error(`No hay repositorio registrado para sincronizar cambios de "${pendingWrite.module}".`);
      }

      const result = await replayer(
        pendingWrite.recordId,
        pendingWrite.value,
        pendingWrite.expectedUpdatedAt,
      );

      if (!result) {
        throw new Error('Repositorio SQLite no disponible.');
      }

      if (!result.ok) {
        throw new Error(result.message);
      }

      removePendingRecordWrite(pendingWrite.module, pendingWrite.recordId);
      return pendingWrite;
    }),
  );

  let flushedCount = 0;
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const pendingWrite = sorted[i];
    if (result.status === 'fulfilled') {
      flushedCount += 1;
      continue;
    }

    const message =
      result.reason instanceof Error
        ? result.reason.message
        : 'No se ha podido sincronizar un cambio pendiente.';

    upsertPendingRecordWrite(
      pendingWrite.module,
      pendingWrite.recordId,
      pendingWrite.value,
      pendingWrite.expectedUpdatedAt,
      message,
    );

    if (!isTemporarySqliteLockMessage(message)) {
      emitPersistenceFeedback({
        kind: 'error',
        updatedAt: new Date().toISOString(),
        key: pendingWriteKey(pendingWrite.module, pendingWrite.recordId),
        message: `Cambio pendiente de "${pendingWrite.module}" sin sincronizar: ${message}`,
      });
    }
  }

  if (flushedCount > 0) {
    emitPersistenceFeedback({
      kind: 'saved',
      updatedAt: new Date().toISOString(),
      message: `Sincronizados ${flushedCount} cambio${flushedCount > 1 ? 's' : ''} pendiente${
        flushedCount > 1 ? 's' : ''
      } en SQLite.`,
    });
  }

  return flushedCount;
}
