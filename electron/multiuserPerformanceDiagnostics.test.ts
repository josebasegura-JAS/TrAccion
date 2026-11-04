import { describe, expect, it } from 'vitest';
import { getMultiuserPerformanceReport, recordMultiuserMetric } from './multiuserPerformanceDiagnostics.js';

describe('multiuser performance diagnostics', () => {
  it('genera métricas p50/p95 y fallos sin información de registros', () => {
    const label = 'tasks:save-record-if-unchanged';
    recordMultiuserMetric('ipc-wait', label, 100);
    recordMultiuserMetric('ipc-wait', label, 200);
    recordMultiuserMetric('ipc-wait', label, 300, true);
    const result = getMultiuserPerformanceReport();
    const summary = result.groups.find((group) => group.category === 'ipc-wait' && group.operation === label);
    expect(summary).toMatchObject({
      count: 3,
      failed: 1,
      averageMs: 200,
      p50Ms: 200,
      p95Ms: 300,
      maxMs: 300,
    });
    expect(JSON.stringify(result)).not.toContain('value_json');
  });

  it('descarta duraciones inválidas y limita la longitud de etiquetas', () => {
    const before = getMultiuserPerformanceReport().sampleCount;
    recordMultiuserMetric('backup', 'invalida', Number.NaN);
    recordMultiuserMetric('backup', 'invalida', -1);
    expect(getMultiuserPerformanceReport().sampleCount).toBe(before);

    recordMultiuserMetric('backup', 'X'.repeat(120), 45);
    const summary = getMultiuserPerformanceReport().groups.find((group) =>
      group.category === 'backup' && group.operation.startsWith('X'));
    expect(summary?.operation).toHaveLength(80);
  });

  it('mantiene muestras acotadas para no degradar jornadas largas', () => {
    for (let i = 0; i < 3200; i += 1) {
      recordMultiuserMetric('record-lock', 'renovación', i);
    }
    const result = getMultiuserPerformanceReport();
    expect(result.sampleCount).toBe(3000);
    expect(result.truncatedToRecent).toBe(3000);
  });
});
