export type PerformanceMetricCategory = 'arranque' | 'navegacion' | 'ajustes';

export interface PerformanceMetric {
  id: string;
  category: PerformanceMetricCategory;
  label: string;
  durationMs: number;
  recordedAt: string;
}

const MAX_METRICS = 40;
const EVENT_NAME = 'traccion:performance-metrics';
let metrics: PerformanceMetric[] = [];

function publish(): void {
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function recordPerformanceMetric(
  category: PerformanceMetricCategory,
  label: string,
  durationMs: number,
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const metric: PerformanceMetric = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    category,
    label,
    durationMs: Math.round(durationMs),
    recordedAt: new Date().toISOString(),
  };
  metrics = [metric, ...metrics].slice(0, MAX_METRICS);
  publish();
}

export function getPerformanceMetrics(): PerformanceMetric[] {
  return [...metrics];
}

export function clearPerformanceMetrics(): void {
  metrics = [];
  publish();
}

export function subscribePerformanceMetrics(listener: () => void): () => void {
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

export async function measurePerformance<T>(
  category: PerformanceMetricCategory,
  label: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    recordPerformanceMetric(category, label, performance.now() - startedAt);
  }
}
