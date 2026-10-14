import {
  loadAllSessionRecordsFromSqlite,
  saveSessionRecordToSqlite,
  type SessionSqliteModuleId,
} from './sessionSqliteRepository';
import {
  isManagedSession,
  normalizeManagedSession,
  type ManagedSession,
  type SessionModuleConfig,
} from './session';

export interface SaveSessionTaskOrderResult {
  ok: boolean;
  message: string;
  session?: ManagedSession;
}

function sameTaskSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return rightSet.size === right.length && left.every((taskId) => rightSet.has(taskId));
}

export function applySessionTaskOrder(
  session: ManagedSession,
  orderedTaskIds: string[],
  now = new Date().toISOString(),
): ManagedSession {
  if (session.status !== 'open') {
    throw new Error('La sesión ya no está abierta. Actualiza antes de guardar el orden.');
  }

  if (!sameTaskSet(session.items, orderedTaskIds)) {
    throw new Error(
      'Los puntos de la sesión han cambiado desde que comenzaste a ordenar. Actualiza la sesión antes de guardar.',
    );
  }

  return { ...session, items: [...orderedTaskIds], updatedAt: now };
}

function parsePersistedSession(rawValue: string, config: SessionModuleConfig): ManagedSession | null {
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof (parsed as { deletedAt?: unknown }).deletedAt === 'string') return null;
    return isManagedSession(parsed)
      ? normalizeManagedSession(parsed, config.newSessionDefaultTitle)
      : null;
  } catch {
    return null;
  }
}

export async function saveSessionTaskOrder(
  config: SessionModuleConfig,
  sessionId: string,
  orderedTaskIds: string[],
  expectedUpdatedAt: string | null,
): Promise<SaveSessionTaskOrderResult> {
  try {
    const moduleId = config.moduleId as SessionSqliteModuleId;
    const records = await loadAllSessionRecordsFromSqlite(moduleId);
    if (!records) {
      throw new Error('SQLite compartido no está disponible. No se puede guardar el orden.');
    }

    const currentRecord = records.find((record) => record.id === sessionId);
    if (!currentRecord) {
      throw new Error('La sesión ya no existe en la base compartida. Actualiza antes de continuar.');
    }

    const latestSession = parsePersistedSession(currentRecord.value, config);
    if (!latestSession) {
      throw new Error('No se ha podido recuperar la sesión actual. Actualiza antes de continuar.');
    }

    if (expectedUpdatedAt && currentRecord.updatedAt !== expectedUpdatedAt) {
      throw new Error(
        'La sesión ha cambiado desde que comenzaste a editarla. Actualiza la sesión antes de guardar el nuevo orden.',
      );
    }

    const updatedSession = applySessionTaskOrder(latestSession, orderedTaskIds);
    await saveSessionRecordToSqlite(
      moduleId,
      config.storageKey,
      sessionId,
      JSON.stringify(updatedSession),
      currentRecord.updatedAt,
    );

    return { ok: true, message: 'Orden guardado.', session: updatedSession };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'No se ha podido guardar el nuevo orden.',
    };
  }
}
