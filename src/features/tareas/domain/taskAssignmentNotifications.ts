import type { Task } from './task';

const STORAGE_PREFIX = 'traccion.taskAssignmentNotices.seen.v1';
const MAX_SEEN_NOTICE_IDS = 500;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('es');
}

function storageKey(windowsUser: string): string {
  const normalizedUser = normalize(windowsUser) || 'usuario-local';
  return `${STORAGE_PREFIX}.${normalizedUser}`;
}

function readSeenNoticeIds(windowsUser: string): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = window.localStorage.getItem(storageKey(windowsUser));
    if (!stored) return new Set();
    const parsed: unknown = JSON.parse(stored);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
        : [],
    );
  } catch {
    return new Set();
  }
}

function writeSeenNoticeIds(windowsUser: string, noticeIds: Iterable<string>): void {
  if (typeof window === 'undefined') return;
  const uniqueIds = Array.from(new Set(noticeIds)).slice(-MAX_SEEN_NOTICE_IDS);
  window.localStorage.setItem(storageKey(windowsUser), JSON.stringify(uniqueIds));
}

export function getUnseenTaskAssignments(
  tasks: readonly Task[],
  responsibleName: string,
  windowsUser: string,
): Task[] {
  const responsible = normalize(responsibleName);
  if (!responsible || !normalize(windowsUser)) return [];

  const seen = readSeenNoticeIds(windowsUser);
  const eligibleTasks = tasks
    .filter((task) =>
      !task.deletedAt &&
      task.assignmentNoticeId &&
      normalize(task.responsable) === responsible &&
      !seen.has(task.assignmentNoticeId),
    )
    .sort((left, right) =>
      (right.assignmentNoticeAt ?? right.updatedAt).localeCompare(
        left.assignmentNoticeAt ?? left.updatedAt,
      ),
    );

  // El store puede refrescarse mientras llega una escritura SQLite y, durante un
  // instante, contener dos snapshots de la misma tarea. El aviso es por tarea,
  // no por fila/snapshot, así que solo mostramos la versión más reciente.
  const uniqueTasks: Task[] = [];
  const seenTaskIds = new Set<string>();
  const seenNoticeIds = new Set<string>();
  for (const task of eligibleTasks) {
    if (seenTaskIds.has(task.id) || seenNoticeIds.has(task.assignmentNoticeId!)) continue;
    seenTaskIds.add(task.id);
    seenNoticeIds.add(task.assignmentNoticeId!);
    uniqueTasks.push(task);
  }

  return uniqueTasks;
}

export function markTaskAssignmentsSeen(windowsUser: string, tasks: readonly Task[]): void {
  const seen = readSeenNoticeIds(windowsUser);
  for (const task of tasks) {
    if (task.assignmentNoticeId) seen.add(task.assignmentNoticeId);
  }
  writeSeenNoticeIds(windowsUser, seen);
}

/** Avisos por acción vinculada, independientes de la asignación de la tarea. */
const ACTION_STORAGE_PREFIX = 'traccion.quickActionAssignments.seen.v1';

export interface PendingLinkedAction {
  task: Task;
  actionId: string;
  noticeId: string;
  title: string;
  assignedAt: string;
}

function actionSeenKey(windowsUser: string): string {
  return `${ACTION_STORAGE_PREFIX}.${normalize(windowsUser)}`;
}

function readActionSeen(windowsUser: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(actionSeenKey(windowsUser));
    const values: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []);
  } catch { return new Set(); }
}

export function getUnseenLinkedActionAssignments(tasks: readonly Task[], windowsUser: string): PendingLinkedAction[] {
  const currentUser = normalize(windowsUser);
  if (!currentUser) return [];
  const seen = readActionSeen(windowsUser);
  const notices: PendingLinkedAction[] = [];
  const unique = new Set<string>();
  for (const task of tasks) {
    if (task.deletedAt) continue;
    for (const tracking of task.seguimiento ?? []) {
      for (const action of tracking.quickActions ?? []) {
        if (action.completedAt || normalize(action.asignadaA ?? '') !== currentUser) continue;
        const noticeId = `${task.id}:${action.id}`;
        if (seen.has(noticeId) || unique.has(noticeId)) continue;
        unique.add(noticeId);
        notices.push({ task, actionId: action.id, noticeId, title: action.titulo, assignedAt: action.createdAt });
      }
    }
  }
  return notices.sort((a, b) => b.assignedAt.localeCompare(a.assignedAt));
}

export function markLinkedActionAssignmentsSeen(windowsUser: string, notices: readonly PendingLinkedAction[]): void {
  if (typeof window === 'undefined') return;
  const seen = readActionSeen(windowsUser);
  notices.forEach((notice) => seen.add(notice.noticeId));
  window.localStorage.setItem(actionSeenKey(windowsUser), JSON.stringify(Array.from(seen).slice(-MAX_SEEN_NOTICE_IDS)));
}
