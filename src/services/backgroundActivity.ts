export type BackgroundActivityKind = 'load' | 'database' | 'sync' | 'import' | 'export' | 'search';

export type BackgroundActivity = {
  id: string;
  label: string;
  detail?: string;
  kind: BackgroundActivityKind;
  startedAt: number;
};

type BackgroundActivityState = { activities: BackgroundActivity[] };
type Listener = (state: BackgroundActivityState) => void;

const activities = new Map<string, BackgroundActivity>();
const listeners = new Set<Listener>();
let sequence = 0;

function snapshot(): BackgroundActivityState {
  return { activities: Array.from(activities.values()).sort((a, b) => a.startedAt - b.startedAt) };
}

function publish(): void {
  const state = snapshot();
  listeners.forEach((listener) => listener(state));
}

export function beginBackgroundActivity(input: Omit<BackgroundActivity, 'id' | 'startedAt'>): () => void {
  sequence += 1;
  const id = `background-${sequence}`;
  activities.set(id, { ...input, id, startedAt: performance.now() });
  publish();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activities.delete(id);
    publish();
  };
}

export async function runBackgroundActivity<T>(
  activity: Omit<BackgroundActivity, 'id' | 'startedAt'>,
  operation: () => Promise<T>,
): Promise<T> {
  const finish = beginBackgroundActivity(activity);
  try {
    return await operation();
  } finally {
    finish();
  }
}

export function getBackgroundActivityState(): BackgroundActivityState {
  return snapshot();
}

export function subscribeBackgroundActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
