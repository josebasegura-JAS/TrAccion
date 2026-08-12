import { isPersistedStorageKey as isKnownPersistedStorageKey } from './persistenceKeys';
import { emitPersistenceFeedback } from './persistenceFeedback';

const NON_JSON_PERSISTED_STORAGE_KEYS = new Set<string>([
  'traccion.v1.tareas.peticionesMigrated',
  'traccion.v1.vinculograma.showExpired',
]);

const reportedCorruptStorageKeys = new Set<string>();

export function logPersistenceMetric(message: string, data?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) {
    return;
  }

  if (data) {
    console.debug(`[persistencia] ${message}`, data);
    return;
  }

  console.debug(`[persistencia] ${message}`);
}

export function summarizeStorageRecordSizes(records: TraccionStorageRecord[]): Array<{
  key: string;
  bytes: number;
}> {
  return records
    .map((record) => ({ key: record.key, bytes: new Blob([record.value]).size }))
    .sort((left, right) => right.bytes - left.bytes);
}

function shouldValidatePersistedJson(key: string): boolean {
  if (!isKnownPersistedStorageKey(key)) {
    return false;
  }

  if (NON_JSON_PERSISTED_STORAGE_KEYS.has(key)) {
    return false;
  }

  return true;
}

function reportCorruptPersistedValue(
  key: string,
  error: unknown,
  source: 'localStorage' | 'sqlite',
): void {
  const message = `Dato persistido corrupto en ${source}. Clave afectada: ${key}. Se omite para permitir el arranque.`;
  console.warn(message, error);

  const reportKey = `${source}:${key}`;
  if (reportedCorruptStorageKeys.has(reportKey)) {
    return;
  }

  reportedCorruptStorageKeys.add(reportKey);
  emitPersistenceFeedback({
    kind: 'error',
    updatedAt: new Date().toISOString(),
    key,
    message,
  });
}

export function isRecoverablePersistedValue(
  key: string,
  value: string,
  source: 'localStorage' | 'sqlite',
): boolean {
  if (!shouldValidatePersistedJson(key)) {
    return true;
  }

  try {
    JSON.parse(value);
    return true;
  } catch (error) {
    reportCorruptPersistedValue(key, error, source);
    return false;
  }
}
