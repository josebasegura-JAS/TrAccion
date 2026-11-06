/**
 * Instrumentación ligera de las consultas SQLite periódicas.
 *
 * Conserva solo nombres de etapas constantes y duraciones: nunca SQL, rutas,
 * tokens, IDs ni valores de registros. Una de cada diez consultas aporta
 * una muestra normal; las lentas y las que fallan se conservan siempre.
 * Se registra al finalizar para no llenar el informe con 5 etapas por poll.
 */
import { recordMultiuserMetric } from '../multiuserPerformanceDiagnostics.js';

type StageName = string;
type MetricWriter = typeof recordMultiuserMetric;

const sampleNumbers = new Map<string, number>();
const DEFAULT_SLOW_THRESHOLD_MS = 250;
const DEFAULT_SAMPLE_EVERY = 10;

export function createSqliteStageDiagnostic(
  operation: string,
  options: {
    thresholdMs?: number;
    sampleEvery?: number;
    now?: () => number;
    record?: MetricWriter;
  } = {},
) {
  const now = options.now ?? Date.now;
  const record = options.record ?? recordMultiuserMetric;
  const previousCount = sampleNumbers.get(operation) ?? 0;
  sampleNumbers.set(operation, previousCount + 1);
  const periodicSample = previousCount % (options.sampleEvery ?? DEFAULT_SAMPLE_EVERY) === 0;
  const startedAt = now();
  const stages: Array<{ name: StageName; elapsedMs: number; failed: boolean }> = [];
  let finished = false;

  function stage<T>(name: StageName, action: () => T): T {
    const started = now();
    let failed = false;
    try {
      return action();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      stages.push({ name, elapsedMs: now() - started, failed });
    }
  }

  async function stageAsync<T>(name: StageName, action: () => Promise<T>): Promise<T> {
    const started = now();
    let failed = false;
    try {
      return await action();
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      stages.push({ name, elapsedMs: now() - started, failed });
    }
  }

  function finish(): void {
    if (finished) return;
    finished = true;
    const elapsedMs = now() - startedAt;
    if (!periodicSample && elapsedMs < (options.thresholdMs ?? DEFAULT_SLOW_THRESHOLD_MS) && !stages.some((item) => item.failed)) {
      return;
    }
    for (const item of stages) {
      record('sqlite-stage', `${operation}:${item.name}`, item.elapsedMs, item.failed);
    }
  }

  return { stage, stageAsync, finish };
}
