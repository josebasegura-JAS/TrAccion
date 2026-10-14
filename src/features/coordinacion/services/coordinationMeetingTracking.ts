import { CLOSED_TASK_PHASE, isTaskClosed, type Task, type TaskDraft } from '../../tareas/domain/task';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import {
  coordinationMeetingDisplayTitle,
  formatCoordinationDate,
  type CoordinationMeeting,
} from '../domain/coordinacion';
import { coordinationPointStatusLabel } from '../store/useCoordinacionStore';

export type TrackingSyncFailure = { pointId: string; message: string };
export type TaskClosureFailure = { taskId: string; message: string };

type PendingTrackingSync = {
  kind: 'sync';
  meetingId: string;
  pointId: string;
  allowStatusOnly: boolean;
  intentId: string;
};

type PendingTrackingRemoval = {
  kind: 'remove';
  meetingId: string;
  pointId: string;
  taskId: string;
  label: string;
  intentId: string;
};

type PendingTrackingEntry = PendingTrackingSync | PendingTrackingRemoval;

type QueueMutationResult = { ok: boolean; message: string };

const PENDING_TRACKING_QUEUE_KEY = 'traccion.v1.coordinacion.pendingTrackingQueue';
const LEGACY_PENDING_TRACKING_SYNC_KEY = 'traccion.v1.coordinacion.pendingTrackingSync';
const LEGACY_PENDING_TRACKING_REMOVAL_KEY = 'traccion.v1.coordinacion.pendingTrackingRemoval';
const MAX_QUEUE_WRITE_ATTEMPTS = 4;

function createIntentId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function entryKey(entry: Pick<PendingTrackingEntry, 'meetingId' | 'pointId'>): string {
  return `${entry.meetingId}:${entry.pointId}`;
}

function isPendingTrackingEntry(value: unknown): value is PendingTrackingEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PendingTrackingEntry>;
  if (
    typeof entry.meetingId !== 'string'
    || typeof entry.pointId !== 'string'
    || typeof entry.intentId !== 'string'
  ) {
    return false;
  }
  if (entry.kind === 'sync') return typeof entry.allowStatusOnly === 'boolean';
  if (entry.kind === 'remove') return typeof entry.taskId === 'string' && typeof entry.label === 'string';
  return false;
}

function parseQueue(value: string | null): PendingTrackingEntry[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isPendingTrackingEntry) : [];
  } catch {
    return [];
  }
}

function writeQueueCache(entries: PendingTrackingEntry[]): void {
  window.localStorage.setItem(PENDING_TRACKING_QUEUE_KEY, JSON.stringify(entries));
}

function readQueueCache(): PendingTrackingEntry[] {
  return parseQueue(window.localStorage.getItem(PENDING_TRACKING_QUEUE_KEY));
}

function isConcurrencyMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('modific') || normalized.includes('cambi') || normalized.includes('conflict');
}

async function readLatestQueue(): Promise<{ entries: PendingTrackingEntry[]; updatedAt: string | null; shared: boolean }> {
  const getter = window.traccion?.getPersistedRecord;
  const saver = window.traccion?.saveLocalStorageRecordIfUnchanged;
  if (!getter || !saver) {
    return { entries: readQueueCache(), updatedAt: null, shared: false };
  }

  const snapshot = await getter(PENDING_TRACKING_QUEUE_KEY);
  if (!snapshot.status.ready || snapshot.status.phase !== 'active' || snapshot.status.isDefaultPath !== false) {
    throw new Error(snapshot.status.message ?? 'SQLite compartido no está disponible para la cola de reconciliación.');
  }

  const entries = parseQueue(snapshot.record?.value ?? null);
  writeQueueCache(entries);
  return { entries, updatedAt: snapshot.record?.updatedAt ?? null, shared: true };
}

async function mutatePendingQueue(
  mutator: (entries: PendingTrackingEntry[]) => PendingTrackingEntry[],
): Promise<QueueMutationResult> {
  let lastMessage = 'No se ha podido actualizar la cola compartida de reconciliación.';

  for (let attempt = 0; attempt < MAX_QUEUE_WRITE_ATTEMPTS; attempt += 1) {
    let snapshot: Awaited<ReturnType<typeof readLatestQueue>>;
    try {
      snapshot = await readLatestQueue();
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : lastMessage,
      };
    }

    const next = mutator(snapshot.entries);
    const currentValue = JSON.stringify(snapshot.entries);
    const nextValue = JSON.stringify(next);
    if (currentValue === nextValue) {
      writeQueueCache(next);
      return { ok: true, message: 'Cola ya actualizada.' };
    }

    if (!snapshot.shared) {
      writeQueueCache(next);
      return { ok: true, message: 'Cola actualizada localmente en entorno sin IPC.' };
    }

    const saver = window.traccion?.saveLocalStorageRecordIfUnchanged;
    if (!saver) return { ok: false, message: lastMessage };

    const result = await saver({
      key: PENDING_TRACKING_QUEUE_KEY,
      value: nextValue,
      expectedUpdatedAt: snapshot.updatedAt,
    });
    if (result.ok && result.status.ready && result.status.phase === 'active' && result.status.isDefaultPath === false) {
      writeQueueCache(next);
      return { ok: true, message: result.message || 'Cola compartida actualizada.' };
    }

    lastMessage = result.message || lastMessage;
    if (!isConcurrencyMessage(lastMessage)) {
      return { ok: false, message: lastMessage };
    }
  }

  return { ok: false, message: lastMessage };
}

function readLegacySyncEntries(): Array<Omit<PendingTrackingSync, 'kind' | 'intentId'>> {
  const stored = window.localStorage.getItem(LEGACY_PENDING_TRACKING_SYNC_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Omit<PendingTrackingSync, 'kind' | 'intentId'> => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as { meetingId?: unknown }).meetingId === 'string'
      && typeof (entry as { pointId?: unknown }).pointId === 'string'
      && typeof (entry as { allowStatusOnly?: unknown }).allowStatusOnly === 'boolean',
    ));
  } catch {
    return [];
  }
}

function readLegacyRemovalEntries(): Array<Omit<PendingTrackingRemoval, 'kind' | 'intentId'>> {
  const stored = window.localStorage.getItem(LEGACY_PENDING_TRACKING_REMOVAL_KEY);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is Omit<PendingTrackingRemoval, 'kind' | 'intentId'> => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as { meetingId?: unknown }).meetingId === 'string'
      && typeof (entry as { pointId?: unknown }).pointId === 'string'
      && typeof (entry as { taskId?: unknown }).taskId === 'string'
      && typeof (entry as { label?: unknown }).label === 'string',
    ));
  } catch {
    return [];
  }
}

async function migrateLegacyPendingQueue(): Promise<void> {
  const legacySync = readLegacySyncEntries();
  const legacyRemovals = readLegacyRemovalEntries();
  if (legacySync.length === 0 && legacyRemovals.length === 0) return;

  const migrated: PendingTrackingEntry[] = [
    ...legacySync.map((entry) => ({ ...entry, kind: 'sync' as const, intentId: createIntentId() })),
    ...legacyRemovals.map((entry) => ({ ...entry, kind: 'remove' as const, intentId: createIntentId() })),
  ];
  const result = await mutatePendingQueue((entries) => {
    const byPoint = new Map(entries.map((entry) => [entryKey(entry), entry]));
    for (const entry of migrated) byPoint.set(entryKey(entry), entry);
    return [...byPoint.values()];
  });

  if (result.ok) {
    window.localStorage.removeItem(LEGACY_PENDING_TRACKING_SYNC_KEY);
    window.localStorage.removeItem(LEGACY_PENDING_TRACKING_REMOVAL_KEY);
  }
}

async function loadPendingQueue(): Promise<PendingTrackingEntry[]> {
  await migrateLegacyPendingQueue();
  try {
    return (await readLatestQueue()).entries;
  } catch {
    return readQueueCache();
  }
}

async function queueTrackingSync(meetingId: string, pointId: string, allowStatusOnly: boolean): Promise<QueueMutationResult> {
  const entry: PendingTrackingSync = {
    kind: 'sync',
    meetingId,
    pointId,
    allowStatusOnly,
    intentId: createIntentId(),
  };
  return mutatePendingQueue((entries) => [
    ...entries.filter((candidate) => entryKey(candidate) !== entryKey(entry)),
    entry,
  ]);
}

export async function queueCoordinationTrackingRemoval(
  entry: Omit<PendingTrackingRemoval, 'kind' | 'intentId'>,
): Promise<QueueMutationResult> {
  const queued: PendingTrackingRemoval = {
    ...entry,
    kind: 'remove',
    intentId: createIntentId(),
  };
  return mutatePendingQueue((entries) => [
    ...entries.filter((candidate) => entryKey(candidate) !== entryKey(queued)),
    queued,
  ]);
}

async function clearPendingEntryIfCurrent(entry: PendingTrackingEntry): Promise<QueueMutationResult> {
  return mutatePendingQueue((entries) => entries.filter((candidate) => !(
    entryKey(candidate) === entryKey(entry) && candidate.intentId === entry.intentId
  )));
}

export function pendingCoordinationTrackingCount(): number {
  const current = readQueueCache().length;
  const legacyKeys = new Set([
    ...readLegacySyncEntries().map((entry) => `${entry.meetingId}:${entry.pointId}`),
    ...readLegacyRemovalEntries().map((entry) => `${entry.meetingId}:${entry.pointId}`),
  ]);
  return current + legacyKeys.size;
}

export function meetingContext(meeting: CoordinationMeeting): string {
  if (meeting.area === 'direccion') return 'Dirección';
  if (meeting.area === 'sindicatos') return meeting.unionName?.trim() || 'sindicato';
  return meeting.areaName?.trim() || 'otra área';
}

function coordinationTrackingId(meetingId: string, pointId: string): string {
  return `coordination:${meetingId}:${pointId}`;
}

function buildCoordinationTrackingText(
  meeting: CoordinationMeeting,
  point: CoordinationMeeting['points'][number],
  allowStatusOnly: boolean,
): string {
  const result = point.result.trim();
  if (!result && !allowStatusOnly) return '';
  const header = `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`;
  const status = coordinationPointStatusLabel(point.status);
  return result ? `${header}\n${status}\n${result}` : `${header}\n${status}`;
}

export function existingTrackingPointIds(meeting: CoordinationMeeting): string[] {
  const tasks = useTaskStore.getState().tasks;
  return meeting.points
    .filter((point) => {
      if (!point.taskId) return false;
      const task = tasks.find((candidate) => candidate.id === point.taskId);
      if (!task || task.deletedAt) return false;
      const trackingId = coordinationTrackingId(meeting.id, point.id);
      return task.seguimiento.some((entry) => entry.id === trackingId);
    })
    .map((point) => point.id);
}

function closingDraft(task: Task): TaskDraft {
  return {
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo: task.tipo,
    fase: CLOSED_TASK_PHASE,
    estado: 'cerrada',
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite,
    responsable: task.responsable,
    origen: task.origen,
    sindicato: task.sindicato,
    observaciones: task.observaciones,
    mail: task.mail,
    documentLinks: task.documentLinks,
  };
}

function queueFailureMessage(base: string, queueResult: QueueMutationResult): string {
  return queueResult.ok ? base : `${base}. Además, no se ha podido registrar el reintento compartido: ${queueResult.message}`;
}

export async function syncMeetingTracking(
  meeting: CoordinationMeeting,
  pointIds: Iterable<string>,
  options: { allowStatusOnly: boolean },
): Promise<TrackingSyncFailure[]> {
  const failures: TrackingSyncFailure[] = [];
  const pendingEntries = await loadPendingQueue();
  const pendingSync = pendingEntries.filter((entry): entry is PendingTrackingSync => entry.kind === 'sync');
  const pointIdSet = new Set(pointIds);
  for (const pending of pendingSync) {
    if (pending.meetingId === meeting.id) pointIdSet.add(pending.pointId);
  }

  for (const pointId of pointIdSet) {
    const queued = pendingSync.find((entry) => entry.meetingId === meeting.id && entry.pointId === pointId);
    const point = meeting.points.find((candidate) => candidate.id === pointId);
    if (!point || !point.taskId) {
      if (queued) await clearPendingEntryIfCurrent(queued);
      continue;
    }

    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === point.taskId);
    if (!task || task.deletedAt) {
      if (queued) await clearPendingEntryIfCurrent(queued);
      continue;
    }

    const allowStatusOnly = queued?.allowStatusOnly ?? options.allowStatusOnly;
    const trackingResult = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: point.taskId,
      trackingId: coordinationTrackingId(meeting.id, point.id),
      text: buildCoordinationTrackingText(meeting, point, allowStatusOnly),
      source: {
        module: 'coordinacion',
        recordId: meeting.id,
        pointId: point.id,
        label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
      },
      closeTask: false,
    });
    if (!trackingResult.ok) {
      const queueResult = await queueTrackingSync(meeting.id, point.id, allowStatusOnly);
      failures.push({
        pointId: point.id,
        message: queueFailureMessage(`${task.titulo}: ${trackingResult.message}`, queueResult),
      });
      continue;
    }

    if (queued) {
      const clearResult = await clearPendingEntryIfCurrent(queued);
      if (!clearResult.ok) {
        failures.push({
          pointId: point.id,
          message: `${task.titulo}: seguimiento guardado, pero no se ha podido confirmar la limpieza de la cola compartida: ${clearResult.message}`,
        });
      }
    }
  }
  return failures;
}

export async function retryPendingCoordinationTracking(
  meetings: CoordinationMeeting[],
): Promise<TrackingSyncFailure[]> {
  const failures: TrackingSyncFailure[] = [];
  const pendingEntries = await loadPendingQueue();

  for (const entry of pendingEntries) {
    if (entry.kind === 'sync') {
      const meeting = meetings.find((candidate) => candidate.id === entry.meetingId);
      const point = meeting?.points.find((candidate) => candidate.id === entry.pointId);
      if (!meeting || !point || !point.taskId) {
        const clearResult = await clearPendingEntryIfCurrent(entry);
        if (!clearResult.ok) failures.push({ pointId: entry.pointId, message: clearResult.message });
        continue;
      }

      const result = await useTaskStore.getState().upsertCoordinationTracking({
        taskId: point.taskId,
        trackingId: coordinationTrackingId(meeting.id, point.id),
        text: buildCoordinationTrackingText(meeting, point, entry.allowStatusOnly),
        source: {
          module: 'coordinacion',
          recordId: meeting.id,
          pointId: point.id,
          label: `Coordinación · ${coordinationMeetingDisplayTitle(meeting)} · ${meetingContext(meeting)} · ${formatCoordinationDate(meeting.date)}`,
        },
        closeTask: false,
      });
      if (result.ok || result.message.toLowerCase().includes('ya no existe') || result.message.toLowerCase().includes('eliminada')) {
        const clearResult = await clearPendingEntryIfCurrent(entry);
        if (!clearResult.ok) failures.push({ pointId: entry.pointId, message: clearResult.message });
        continue;
      }
      failures.push({ pointId: point.id, message: `${point.title}: ${result.message}` });
      continue;
    }

    const result = await useTaskStore.getState().upsertCoordinationTracking({
      taskId: entry.taskId,
      trackingId: coordinationTrackingId(entry.meetingId, entry.pointId),
      text: '',
      source: {
        module: 'coordinacion',
        recordId: entry.meetingId,
        pointId: entry.pointId,
        label: entry.label,
      },
      closeTask: false,
    });
    if (result.ok || result.message.toLowerCase().includes('ya no existe') || result.message.toLowerCase().includes('eliminada')) {
      const clearResult = await clearPendingEntryIfCurrent(entry);
      if (!clearResult.ok) failures.push({ pointId: entry.pointId, message: clearResult.message });
      continue;
    }
    failures.push({ pointId: entry.pointId, message: result.message });
  }
  return failures;
}

export async function closeCoordinationTasks(taskIds: Iterable<string>): Promise<TaskClosureFailure[]> {
  const failures: TaskClosureFailure[] = [];
  for (const taskId of new Set(taskIds)) {
    const task = useTaskStore.getState().tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.deletedAt || isTaskClosed(task)) continue;
    const result = await useTaskStore.getState().updateWithConcurrencyCheck(
      task.id,
      closingDraft(task),
      'Tarea cerrada expresamente al cerrar una reunión de Coordinación.',
      task.updatedAt,
    );
    if (!result.ok) failures.push({ taskId, message: `${task.titulo}: ${result.message}` });
  }
  return failures;
}
