import type { MultiuserMetricSummary } from './multiuserPerformanceDiagnostics.js';

/**
 * Comparación descriptiva de informes: no deduce causalidad, ni acredita
 * estabilidad cuando el número de mediciones es insuficiente.
 */
export interface PerformanceSnapshot {
  sampleCount: number;
  truncatedToRecent: number;
  groups: MultiuserMetricSummary[];
}

export interface OperationComparison {
  category: string;
  operation: string;
  baselineCount: number;
  candidateCount: number;
  baselineP95Ms: number | null;
  candidateP95Ms: number | null;
  p95ChangePercent: number | null;
  baselineFailureRatePercent: number | null;
  candidateFailureRatePercent: number | null;
  comparable: boolean;
  reason: string | null;
}

export interface PerformanceComparison {
  warnings: string[];
  operations: OperationComparison[];
}

const MIN_SAMPLES_PER_OPERATION = 20;

export function compareMultiuserPerformance(
  baseline: PerformanceSnapshot,
  candidate: PerformanceSnapshot,
): PerformanceComparison {
  const warnings: string[] = [];
  if (baseline.sampleCount >= baseline.truncatedToRecent ||
      candidate.sampleCount >= candidate.truncatedToRecent) {
    warnings.push('Al menos un informe alcanzó su límite de muestras: el histórico anterior pudo descartarse.');
  }
  const key = (item: MultiuserMetricSummary): string => JSON.stringify([item.category, item.operation]);
  const before = new Map(baseline.groups.map((item) => [key(item), item]));
  const after = new Map(candidate.groups.map((item) => [key(item), item]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  const operations = keys.map((id): OperationComparison => {
    const prior = before.get(id);
    const next = after.get(id);
    const comparable = Boolean(prior && next &&
      prior.count >= MIN_SAMPLES_PER_OPERATION &&
      next.count >= MIN_SAMPLES_PER_OPERATION &&
      Number.isFinite(prior.p95Ms) && Number.isFinite(next.p95Ms) &&
      prior.p95Ms > 0);
    const basis = next ?? prior!;
    return {
      category: basis.category,
      operation: basis.operation,
      baselineCount: prior?.count ?? 0,
      candidateCount: next?.count ?? 0,
      baselineP95Ms: prior?.p95Ms ?? null,
      candidateP95Ms: next?.p95Ms ?? null,
      p95ChangePercent: comparable
        ? Math.round(((next!.p95Ms - prior!.p95Ms) / prior!.p95Ms) * 100)
        : null,
      baselineFailureRatePercent: prior && prior.count > 0
        ? Math.round((prior.failed / prior.count) * 1000) / 10 : null,
      candidateFailureRatePercent: next && next.count > 0
        ? Math.round((next.failed / next.count) * 1000) / 10 : null,
      comparable,
      reason: comparable ? null : !prior || !next
        ? 'La operación no está presente en ambos informes.'
        : prior.count < MIN_SAMPLES_PER_OPERATION || next.count < MIN_SAMPLES_PER_OPERATION
          ? 'Menos de 20 muestras en alguno de los informes.'
          : 'El P95 de referencia es cero o inválido; no se calcula variación relativa.',
    };
  });

  if (operations.some((op) => !op.comparable)) {
    warnings.push('Hay operaciones sin una cantidad suficiente de muestras comparables.');
  }
  warnings.push('Una diferencia de P95 no demuestra causalidad: comparar misma carga, equipos, red y periodo.');
  warnings.push('Solo se miden operaciones completadas; una operación bloqueada indefinidamente puede no aportar muestra.');
  return { warnings, operations };
}
