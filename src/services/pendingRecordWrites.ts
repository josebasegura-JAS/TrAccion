import { SQLITE_PENDING_RECORD_WRITES_KEY } from './persistenceKeys';

export interface PendingRecordWriteSaveResult {
  ok: boolean;
  message: string;
  currentUpdatedAt: string | null;
}

export interface PendingRecordWriteResult extends PendingRecordWriteSaveResult {
  queued?: boolean;
}

type PendingWriteReplayer = (
  recordId: string,
  value: string,
  expectedUpdatedAt: string | null,
) => Promise<PendingRecordWriteSaveResult | null>;

/**
 * Compatibilidad de API para repositorios ya migrados. TrAcción no admite
 * escrituras offline: no se registra ni reproduce ninguna cola local.
 */
export function registerPendingWriteReplayer(module: string, replayer: PendingWriteReplayer): void {
  void module;
  void replayer;
  // Intencionadamente vacío. Se conserva temporalmente para evitar un refactor
  // masivo de repositorios en esta entrega de robustez.
}

function clearLegacyPendingRecordWrites(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SQLITE_PENDING_RECORD_WRITES_KEY);
}

export function getPendingRecordWriteCount(): number {
  clearLegacyPendingRecordWrites();
  return 0;
}

export interface SaveRecordWithPendingFallbackOptions {
  module: string;
  recordId: string;
  value: string;
  expectedUpdatedAt: string | null;
  save: () => Promise<PendingRecordWriteSaveResult | null>;
}

/**
 * Guardado estricto SQLite. Un cambio solo es válido cuando SQLite compartida
 * lo confirma. Nunca se encola ni se persiste localmente para reintentar luego.
 */
export async function saveRecordWithPendingFallback({
  save,
}: SaveRecordWithPendingFallbackOptions): Promise<PendingRecordWriteResult> {
  clearLegacyPendingRecordWrites();

  try {
    const result = await save();
    if (result === null) {
      return {
        ok: false,
        message: 'Repositorio SQLite no disponible. El cambio no se ha guardado.',
        currentUpdatedAt: null,
        queued: false,
      };
    }

    if (result.ok) {
      return result;
    }

    if (result.message.toLowerCase().includes('modificado por otro usuario')) {
      return result;
    }

    return {
      ...result,
      message: `${result.message} El cambio NO se ha guardado localmente. Recupera la conexión con SQLite antes de continuar.`,
      queued: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error de conexión con SQLite.';
    return {
      ok: false,
      message: `${message} El cambio NO se ha guardado localmente. Recupera la conexión con SQLite antes de continuar.`,
      currentUpdatedAt: null,
      queued: false,
    };
  }
}

/**
 * Las versiones actuales no reproducen colas locales antiguas. Se purgan para
 * impedir que un cambio offline obsoleto se aplique más tarde sobre SQLite.
 */
export async function flushPendingRecordWrites(): Promise<number> {
  clearLegacyPendingRecordWrites();
  return 0;
}
