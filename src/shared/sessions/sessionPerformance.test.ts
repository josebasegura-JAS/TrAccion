import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPerformanceMetrics, getPerformanceMetrics } from '../../services/performanceMetrics';
import { measureSessionOperation } from './sessionPerformance';

describe('diagnóstico de latencia de Comité y Paritaria', () => {
  beforeEach(() => clearPerformanceMetrics());

  it.each(['comite', 'paritaria'])('mide la operación sin cambiar su resultado en %s', async (moduleId) => {
    const operation = vi.fn(async () => ({ ok: true, value: 42 }));
    await expect(measureSessionOperation(moduleId, 'guardar', operation, (result) => !result.ok))
      .resolves.toEqual({ ok: true, value: 42 });
    expect(operation).toHaveBeenCalledTimes(1);
    expect(getPerformanceMetrics()).toHaveLength(1);
    expect(getPerformanceMetrics()[0]).toMatchObject({
      category: 'sesiones',
      label: `${moduleId === 'comite' ? 'Comité' : 'Paritaria'} · guardar · correcto`,
    });
  });

  it('registra un resultado de conflicto sin tratarlo como éxito', async () => {
    const result = await measureSessionOperation('comite', 'cierre SQLite',
      async () => ({ ok: false }), (value) => !value.ok);
    expect(result.ok).toBe(false);
    expect(getPerformanceMetrics()[0]?.label).toBe('Comité · cierre SQLite · fallo');
  });

  it('registra fallo y propaga la excepción original sin guardar datos sensibles', async () => {
    const message = 'Persona privada y ruta \\servidor\\expediente';
    await expect(measureSessionOperation('paritaria', 'resumen Word', async () => {
      throw new Error(message);
    })).rejects.toThrow(message);
    const serialized = JSON.stringify(getPerformanceMetrics());
    expect(serialized).not.toContain(message);
    expect(getPerformanceMetrics()[0]?.label).toBe('Paritaria · resumen Word · fallo');
  });

  it('no registra identificadores de módulos desconocidos', async () => {
    await measureSessionOperation('otro', 'abrir', async () => undefined);
    expect(getPerformanceMetrics()).toEqual([]);
  });

  it('respeta el límite de métricas en memoria', async () => {
    for (let i = 0; i < 50; i += 1) {
      await measureSessionOperation('comite', 'sincronización', async () => i);
    }
    expect(getPerformanceMetrics()).toHaveLength(40);
  });
});
