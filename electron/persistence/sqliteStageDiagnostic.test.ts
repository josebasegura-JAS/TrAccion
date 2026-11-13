import { describe, expect, it, vi } from 'vitest';
import { createSqliteStageDiagnostic } from './sqliteStageDiagnostic';

describe('instrumentación por etapas SQLite', () => {
  it('recoge muestras normales de forma acotada sin alterar los valores', () => {
    let now = 0;
    const record = vi.fn();
    const measure = createSqliteStageDiagnostic('test:normal', {
      now: () => now,
      record,
      thresholdMs: 250,
      sampleEvery: 10,
    });
    const value = measure.stage('consulta', () => {
      now += 12;
      return 42;
    });
    measure.finish();
    measure.finish();
    expect(value).toBe(42);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith('sqlite-stage', 'test:normal:consulta', 12, false);

    const next = createSqliteStageDiagnostic('test:normal', { now: () => now, record, thresholdMs: 250, sampleEvery: 10 });
    next.stage('consulta', () => { now += 15; });
    next.finish();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('guarda todas las etapas de una consulta lenta aunque no toque muestreo periódico', () => {
    let now = 0;
    const record = vi.fn();
    createSqliteStageDiagnostic('test:lenta', { now: () => now, record, thresholdMs: 100, sampleEvery: 10 }).finish();
    record.mockClear();
    const diagnostic = createSqliteStageDiagnostic('test:lenta', { now: () => now, record, thresholdMs: 100, sampleEvery: 10 });
    diagnostic.stage('archivo', () => { now += 80; });
    diagnostic.stage('identidad', () => { now += 50; });
    diagnostic.finish();
    expect(record.mock.calls).toEqual([
      ['sqlite-stage', 'test:lenta:archivo', 80, false],
      ['sqlite-stage', 'test:lenta:identidad', 50, false],
    ]);
  });

  it('conserva la etapa fallida y propaga el error sin alterar la consulta', async () => {
    let now = 0;
    const record = vi.fn();
    const diagnostic = createSqliteStageDiagnostic('test:error', { now: () => now, record });
    await expect(diagnostic.stageAsync('archivo', async () => {
      now += 7;
      throw new Error('E/S inaccesible');
    })).rejects.toThrow('E/S inaccesible');
    diagnostic.finish();
    expect(record).toHaveBeenCalledWith('sqlite-stage', 'test:error:archivo', 7, true);
  });
  it('PR9A: expone etapa activa, fallida y duraciones sin alterar la propagación', async () => {
    const diagnostic = createSqliteStageDiagnostic('test:pr9a', { record: vi.fn() });
    expect(diagnostic.snapshot()).toEqual({ currentStage: null, failedStage: null, stages: [] });
    diagnostic.stage('consulta', () => {
      expect(diagnostic.snapshot().currentStage).toBe('consulta');
      return 1;
    });
    await expect(diagnostic.stageAsync('archivo', async () => {
      expect(diagnostic.snapshot().currentStage).toBe('archivo');
      throw new Error('fallo de red');
    })).rejects.toThrow('fallo de red');
    expect(diagnostic.snapshot().currentStage).toBeNull();
    expect(diagnostic.snapshot().failedStage).toBe('archivo');
    expect(diagnostic.snapshot().stages.map((item) => [item.name, item.failed])).toEqual([
      ['consulta', false], ['archivo', true],
    ]);
  });

});
