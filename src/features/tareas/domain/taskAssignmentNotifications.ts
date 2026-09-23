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
  return tasks
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
}

export function markTaskAssignmentsSeen(windowsUser: string, tasks: readonly Task[]): void {
  const seen = readSeenNoticeIds(windowsUser);
  for (const task of tasks) {
    if (task.assignmentNoticeId) seen.add(task.assignmentNoticeId);
  }
  writeSeenNoticeIds(windowsUser, seen);
}
