import { describe, expect, it } from 'vitest';
import { compareMultiuserPerformance, type PerformanceSnapshot } from './multiuserPerformanceComparison.js';
import type { MultiuserMetricSummary } from './multiuserPerformanceDiagnostics.js';

function summary(operation: string, count: number, p95Ms: number, failed = 0): MultiuserMetricSummary {
  return {
    category: 'ipc-wait', operation, count, failed,
    averageMs: p95Ms, p50Ms: p95Ms, p95Ms, maxMs: p95Ms,
  };
}
function report(groups: MultiuserMetricSummary[], sampleCount = 100): PerformanceSnapshot {
  return { groups, sampleCount, truncatedToRecent: 3000 };
}

describe('comparación prudente de informes multiusuario', () => {
  it('calcula variación de P95 y tasas de fallo solo con volumen suficiente', () => {
    const result = compareMultiuserPerformance(
      report([summary('tasks:load', 40, 200, 4)]),
      report([summary('tasks:load', 60, 150, 3)]),
    );
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0]).toMatchObject({
      comparable: true, p95ChangePercent: -25,
      baselineFailureRatePercent: 10, candidateFailureRatePercent: 5,
    });
  });

  it('no declara una mejora relativa con escasas muestras o P95 inicial cero', () => {
    const result = compareMultiuserPerformance(
      report([summary('a', 4, 500), summary('b', 30, 0)]),
      report([summary('a', 4, 20), summary('b', 30, 10)]),
    );
    expect(result.operations.every((row) => row.comparable === false)).toBe(true);
    expect(result.operations.every((row) => row.p95ChangePercent === null)).toBe(true);
    expect(result.warnings.some((message) => message.includes('muestras comparables'))).toBe(true);
  });

  it('identifica operaciones desaparecidas y no confunde ausencia con cero milisegundos', () => {
    const result = compareMultiuserPerformance(report([summary('a', 25, 50)]), report([summary('b', 25, 80)]));
    expect(result.operations).toHaveLength(2);
    expect(result.operations.every((row) => row.comparable === false)).toBe(true);
    expect(result.operations.find((row) => row.operation === 'a')?.candidateP95Ms).toBeNull();
  });

  it('advierte sobre la ventana limitada a las últimas 3000 muestras', () => {
    const result = compareMultiuserPerformance(
      report([summary('a', 50, 40)], 3000),
      report([summary('a', 50, 35)], 100),
    );
    expect(result.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('histórico anterior pudo descartarse'),
      expect.stringContaining('bloqueada indefinidamente'),
    ]));
  });

  it('no divide por cero cuando faltan operaciones o hay recuentos vacíos', () => {
    const result = compareMultiuserPerformance(report([summary('a', 0, 0)]), report([]));
    expect(result.operations[0].baselineFailureRatePercent).toBeNull();
    expect(result.operations[0].p95ChangePercent).toBeNull();
  });
});
