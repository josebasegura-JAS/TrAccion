import { publishDatabaseStatus } from '../../../services/databaseStatus';
import { readStorageItem } from '../../../services/persistence';
import { saveSharedArrayMutation } from '../../../services/sharedRecordPersistence';

export const TASK_CRITERION_LINKS_STORAGE_KEY = 'traccion.v1.tareas.criterios-rrll.links';

export interface TaskCriterionLink {
  taskId: string;
  criterioId: string;
  createdAt: string;
}

function parseLinks(raw: string | null): TaskCriterionLink[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is TaskCriterionLink => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<TaskCriterionLink>;
      return (
        typeof candidate.taskId === 'string' && candidate.taskId.length > 0 &&
        typeof candidate.criterioId === 'string' && candidate.criterioId.length > 0 &&
        typeof candidate.createdAt === 'string'
      );
    });
  } catch {
    return [];
  }
}

function readCachedLinks(): TaskCriterionLink[] {
  return parseLinks(readStorageItem(TASK_CRITERION_LINKS_STORAGE_KEY));
}

async function loadLinks(): Promise<TaskCriterionLink[]> {
  if (import.meta.env.MODE === 'test') return readCachedLinks();

  const getter = window.traccion?.getPersistedRecord;
  if (!getter) {
    throw new Error('SQLite compartido no disponible. No se puede consultar la vinculación Tarea ↔ Criterio RRLL.');
  }

  const snapshot = await getter(TASK_CRITERION_LINKS_STORAGE_KEY);
  publishDatabaseStatus(snapshot.status);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active') {
    throw new Error(snapshot.status.message ?? 'SQLite compartido no está activo.');
  }

  const value = snapshot.record?.value ?? null;
  if (value !== null) {
    window.localStorage.setItem(TASK_CRITERION_LINKS_STORAGE_KEY, value);
    return parseLinks(value);
  }

  // Migración puntual de instalaciones anteriores: esta relación no formaba parte
  // de las claves compartidas, por lo que puede existir únicamente en localStorage.
  // Si SQLite todavía no tiene el registro, lo sembramos con el valor local sin
  // sobrescribir un valor que otro usuario haya podido crear entretanto.
  const legacyLinks = readCachedLinks();
  if (legacyLinks.length === 0) return [];

  const migrated = await saveSharedArrayMutation({
    storageKey: TASK_CRITERION_LINKS_STORAGE_KEY,
    parseRecords: parseLinks,
    updateRecords: (latest) => (latest.length > 0 ? latest : legacyLinks),
  });
  return migrated.records;
}

async function mutateLinks(
  updateRecords: (latest: TaskCriterionLink[]) => TaskCriterionLink[],
): Promise<TaskCriterionLink[]> {
  if (import.meta.env.MODE === 'test') {
    const next = updateRecords(readCachedLinks());
    window.localStorage.setItem(TASK_CRITERION_LINKS_STORAGE_KEY, JSON.stringify(next));
    return next;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await saveSharedArrayMutation({
        storageKey: TASK_CRITERION_LINKS_STORAGE_KEY,
        parseRecords: parseLinks,
        updateRecords,
      });
      return result.records;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const isConflict = message.includes('otro usuario') || message.includes('conflicto') || message.includes('modified');
      if (!isConflict || attempt === 1) throw error;
    }
  }
  throw lastError;
}

export async function getCriterionIdForTask(taskId: string): Promise<string | null> {
  return (await loadLinks()).find((link) => link.taskId === taskId)?.criterioId ?? null;
}

export async function getTaskIdForCriterion(criterioId: string): Promise<string | null> {
  return (await loadLinks()).find((link) => link.criterioId === criterioId)?.taskId ?? null;
}

export async function linkTaskToCriterion(taskId: string, criterioId: string): Promise<void> {
  await mutateLinks((current) => [
    ...current.filter((link) => link.taskId !== taskId && link.criterioId !== criterioId),
    { taskId, criterioId, createdAt: new Date().toISOString() },
  ]);
}

export async function unlinkTaskCriterion(taskId: string): Promise<void> {
  await mutateLinks((current) => current.filter((link) => link.taskId !== taskId));
}
