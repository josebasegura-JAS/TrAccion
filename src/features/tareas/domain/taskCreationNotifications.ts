import type { Task } from './task';

const STORAGE_PREFIX = 'traccion.taskCreationNotices.v1';
const MAX_SEEN_TASK_IDS = 1000;

type StoredCreationNoticeState = {
  baselineAt: string;
  seenTaskIds: string[];
};

function normalizeUser(value: string): string {
  return value.trim().toLocaleLowerCase('es') || 'usuario-local';
}

function storageKey(windowsUser: string): string {
  return `${STORAGE_PREFIX}.${normalizeUser(windowsUser)}`;
}

function readState(windowsUser: string): StoredCreationNoticeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey(windowsUser));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<StoredCreationNoticeState>;
    if (typeof candidate.baselineAt !== 'string') return null;
    return {
      baselineAt: candidate.baselineAt,
      seenTaskIds: Array.isArray(candidate.seenTaskIds)
        ? candidate.seenTaskIds.filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        : [],
    };
  } catch {
    return null;
  }
}

function writeState(windowsUser: string, state: StoredCreationNoticeState): void {
  if (typeof window === 'undefined') return;
  const uniqueSeen = Array.from(new Set(state.seenTaskIds)).slice(-MAX_SEEN_TASK_IDS);
  window.localStorage.setItem(storageKey(windowsUser), JSON.stringify({ ...state, seenTaskIds: uniqueSeen }));
}

export function initializeTaskCreationNoticeBaseline(windowsUser: string, now = new Date().toISOString()): void {
  if (!windowsUser.trim() || readState(windowsUser)) return;
  writeState(windowsUser, { baselineAt: now, seenTaskIds: [] });
}

export function getUnseenTaskCreations(tasks: readonly Task[], windowsUser: string): Task[] {
  const state = readState(windowsUser);
  if (!state) return [];
  const seen = new Set(state.seenTaskIds);
  const unique = new Map<string, Task>();
  for (const task of tasks) {
    if (task.deletedAt || seen.has(task.id) || task.createdAt <= state.baselineAt) continue;
    const current = unique.get(task.id);
    if (!current || task.updatedAt > current.updatedAt) unique.set(task.id, task);
  }
  return Array.from(unique.values()).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function markTaskCreationIdsSeen(windowsUser: string, taskIds: readonly string[]): void {
  const state = readState(windowsUser);
  if (!state) return;
  writeState(windowsUser, {
    ...state,
    seenTaskIds: [...state.seenTaskIds, ...taskIds.filter(Boolean)],
  });
}

export function markTaskCreationsSeen(windowsUser: string, tasks: readonly Task[]): void {
  markTaskCreationIdsSeen(windowsUser, tasks.map((task) => task.id));
}
