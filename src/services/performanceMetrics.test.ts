import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPerformanceMetrics,
  getPerformanceMetrics,
  measurePerformance,
  recordPerformanceMetric,
} from './performanceMetrics';

describe('performanceMetrics', () => {
  beforeEach(() => clearPerformanceMetrics());

  it('registra y redondea una medición válida', () => {
    recordPerformanceMetric('navegacion', 'Tareas', 123.6);
    expect(getPerformanceMetrics()[0]).toMatchObject({ category: 'navegacion', label: 'Tareas', durationMs: 124 });
  });

  it('descarta duraciones inválidas', () => {
    recordPerformanceMetric('arranque', 'inválida', -1);
    expect(getPerformanceMetrics()).toHaveLength(0);
  });

  it('mide operaciones asíncronas sin alterar su resultado', async () => {
    const result = await measurePerformance('ajustes', 'detalle', async () => 'ok');
    expect(result).toBe('ok');
    expect(getPerformanceMetrics()).toHaveLength(1);
  });
});
