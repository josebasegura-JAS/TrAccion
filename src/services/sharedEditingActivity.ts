const SHARED_EDITING_ACTIVITY_EVENT = 'traccion:shared-editing-activity-changed';

const activeLocks = new Set<string>();

function lockKey(module: string, recordId: string): string {
  return `${module}:${recordId}`;
}

function emitSharedEditingActivityChanged(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(SHARED_EDITING_ACTIVITY_EVENT));
}

export function markSharedEditingActive(module: string, recordId: string): void {
  const key = lockKey(module, recordId);
  if (activeLocks.has(key)) {
    return;
  }

  activeLocks.add(key);
  emitSharedEditingActivityChanged();
}

export function markSharedEditingInactive(module: string, recordId: string): void {
  const key = lockKey(module, recordId);
  if (!activeLocks.delete(key)) {
    return;
  }

  emitSharedEditingActivityChanged();
}

export function hasActiveSharedEditing(): boolean {
  return activeLocks.size > 0;
}

export function subscribeSharedEditingActivity(listener: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(SHARED_EDITING_ACTIVITY_EVENT, listener);
  return () => window.removeEventListener(SHARED_EDITING_ACTIVITY_EVENT, listener);
}
