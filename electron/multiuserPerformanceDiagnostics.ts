/**
 * Diagnóstico local y acotado de contención multiusuario.
 *
 * No lee registros ni rutas ni datos personales; solo guarda nombres fijos de
 * operaciones y duraciones. La instantánea la escribe Electron en userData,
 * nunca en SMB. La instrumentación no participa en la persistencia.
 */
export type MultiuserMetricCategory = 'ipc-wait' | 'ipc-run' | 'smb-lock-wait' | 'smb-lock-held' | 'record-lock' | 'backup';

export interface MultiuserMetricSummary {
  category: MultiuserMetricCategory;
  operation: string;
  count: number;
  failed: number;
  averageMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
}

type Sample = { category: MultiuserMetricCategory; operation: string; ms: number; failed: boolean };

const MAX_SAMPLES = 3000;
const startedAt = new Date().toISOString();
const samples: Sample[] = [];

export function recordMultiuserMetric(category: MultiuserMetricCategory, operation: string, ms: number, failed = false): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  // El llamador debe utilizar nombres constantes, nunca identificadores
  // de personas, tareas o rutas. Se limita además la longitud de la etiqueta.
  samples.push({ category, operation: operation.slice(0, 80), ms: Math.round(ms), failed });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

function percentile(sorted: number[], percentileRank: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.ceil((percentileRank / 100) * sorted.length) - 1] ?? 0;
}

export function getMultiuserPerformanceReport(): {
  startedAt: string;
  recordedAt: string;
  sampleCount: number;
  truncatedToRecent: number;
  groups: MultiuserMetricSummary[];
} {
  const groups = new Map<string, Sample[]>();
  for (const item of samples) {
    const key = `${item.category}:${item.operation}`;
    const current = groups.get(key) ?? [];
    current.push(item);
    groups.set(key, current);
  }

  return {
    startedAt,
    recordedAt: new Date().toISOString(),
    sampleCount: samples.length,
    truncatedToRecent: MAX_SAMPLES,
    groups: [...groups.values()].map((items): MultiuserMetricSummary => {
      const durations = items.map((item) => item.ms).sort((a, b) => a - b);
      return {
        category: items[0].category,
        operation: items[0].operation,
        count: items.length,
        failed: items.filter((item) => item.failed).length,
        averageMs: Math.round(durations.reduce((sum, value) => sum + value, 0) / items.length),
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        maxMs: durations[durations.length - 1],
      };
    }).sort((a, b) => b.p95Ms - a.p95Ms),
  };
}
