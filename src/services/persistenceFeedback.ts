import {
  publishDatabaseConnectivityBlock,
  resetDatabaseConnectivityBlock,
} from './editingAvailability';

export type PersistenceFeedbackKind = 'saving' | 'saved' | 'error';
export type PersistenceFeedbackVisibility = 'visible' | 'silent';

export interface PersistenceFeedback {
  kind: PersistenceFeedbackKind;
  updatedAt: string;
  key?: string;
  message: string;
  visibility?: PersistenceFeedbackVisibility;
}

const PERSISTENCE_FEEDBACK_EVENT = 'traccion:persistence-feedback';
const DATABASE_CONNECTIVITY_RECOVERED_EVENT = 'traccion:database-connectivity-recovered';

let latestPersistenceFeedback: PersistenceFeedback | null = null;
let silentPersistenceFeedbackDepth = 0;
let unsubscribeDatabaseConnectivityIssue: (() => void) | null = null;

function isDatabaseConnectivityIssue(value: unknown): value is TraccionDatabaseConnectivityIssue {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TraccionDatabaseConnectivityIssue>;
  return (
    typeof candidate.blocked === 'boolean' &&
    typeof candidate.message === 'string' &&
    typeof candidate.failedHeartbeatCount === 'number' &&
    typeof candidate.updatedAt === 'string'
  );
}

export function startDatabaseConnectivityIssueListener(): void {
  if (unsubscribeDatabaseConnectivityIssue || !window.traccion?.onDatabaseConnectivityIssue) {
    return;
  }

  unsubscribeDatabaseConnectivityIssue = window.traccion.onDatabaseConnectivityIssue((payload) => {
    if (!isDatabaseConnectivityIssue(payload)) {
      return;
    }

    publishDatabaseConnectivityBlock(payload.blocked, payload.message);
    emitPersistenceFeedback({
      kind: payload.blocked ? 'error' : 'saved',
      updatedAt: payload.updatedAt,
      message: payload.message,
    });

    if (!payload.blocked) {
      window.dispatchEvent(new CustomEvent(DATABASE_CONNECTIVITY_RECOVERED_EVENT));
    }
  });
}

export function stopDatabaseConnectivityIssueListener(): void {
  unsubscribeDatabaseConnectivityIssue?.();
  unsubscribeDatabaseConnectivityIssue = null;
  resetDatabaseConnectivityBlock();
}

export function isTemporarySqliteLockMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('base ocupada temporalmente') ||
    normalized.includes('bloqueo temporal de operación sqlite')
  );
}

export function emitPersistenceFeedback(feedback: PersistenceFeedback): void {
  const effectiveFeedback: PersistenceFeedback =
    silentPersistenceFeedbackDepth > 0 && typeof feedback.visibility === 'undefined'
      ? { ...feedback, visibility: 'silent' }
      : feedback;

  latestPersistenceFeedback = effectiveFeedback;
  window.dispatchEvent(
    new CustomEvent<PersistenceFeedback>(PERSISTENCE_FEEDBACK_EVENT, { detail: effectiveFeedback }),
  );
}

export async function runWithSilentPersistenceFeedback<T>(operation: () => Promise<T>): Promise<T> {
  silentPersistenceFeedbackDepth += 1;
  try {
    return await operation();
  } finally {
    silentPersistenceFeedbackDepth = Math.max(0, silentPersistenceFeedbackDepth - 1);
  }
}

export function runSyncWithSilentPersistenceFeedback<T>(operation: () => T): T {
  silentPersistenceFeedbackDepth += 1;
  try {
    return operation();
  } finally {
    silentPersistenceFeedbackDepth = Math.max(0, silentPersistenceFeedbackDepth - 1);
  }
}

export function isPersistenceFeedbackSilent(feedback: PersistenceFeedback): boolean {
  return feedback.visibility === 'silent';
}

export function publishPersistenceBusy(
  key: string,
  message: string,
  visibility: PersistenceFeedbackVisibility = 'visible',
): void {
  emitPersistenceFeedback({
    kind: 'saving',
    updatedAt: new Date().toISOString(),
    key,
    message,
    visibility,
  });
}

export function clearPersistenceBusy(
  key: string,
  message = 'Operación finalizada.',
  visibility: PersistenceFeedbackVisibility = 'visible',
): void {
  emitPersistenceFeedback({
    kind: 'saved',
    updatedAt: new Date().toISOString(),
    key,
    message,
    visibility,
  });
}

export function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

export function subscribeToPersistenceFeedback(
  listener: (feedback: PersistenceFeedback) => void,
): () => void {
  const handler = (event: Event) => {
    listener((event as CustomEvent<PersistenceFeedback>).detail);
  };

  window.addEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
  if (latestPersistenceFeedback) {
    listener(latestPersistenceFeedback);
  }
  return () => window.removeEventListener(PERSISTENCE_FEEDBACK_EVENT, handler);
}
