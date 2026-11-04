import { recordPerformanceMetric } from '../../services/performanceMetrics';

export type SessionPerformanceAction =
  | 'abrir'
  | 'históricos'
  | 'sincronización'
  | 'crear'
  | 'guardar'
  | 'eliminar'
  | 'reabrir'
  | 'puntos vinculados'
  | 'cierre SQLite'
  | 'resumen Word';

/**
 * Diagnóstico local, acotado y sin información personal: solo módulo,
 * operación, resultado y tiempo. Se apoya en el buffer en memoria existente.
 * Nunca almacena títulos, nombres, IDs, rutas, puntos ni errores completos.
 */
export async function measureSessionOperation<T>(
  moduleId: string,
  action: SessionPerformanceAction,
  operation: () => Promise<T>,
  isFailure: (value: T) => boolean = () => false,
): Promise<T> {
  const started = performance.now();
  let status: 'correcto' | 'fallo' = 'fallo';
  try {
    const result = await operation();
    status = isFailure(result) ? 'fallo' : 'correcto';
    return result;
  } finally {
    if (moduleId === 'comite' || moduleId === 'paritaria') {
      recordPerformanceMetric(
        'sesiones',
        `${moduleId === 'comite' ? 'Comité' : 'Paritaria'} · ${action} · ${status}`,
        performance.now() - started,
      );
    }
  }
}
