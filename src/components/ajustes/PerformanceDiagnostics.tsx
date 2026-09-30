import { useEffect, useMemo, useState } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import {
  clearPerformanceMetrics,
  getPerformanceMetrics,
  subscribePerformanceMetrics,
  recordPerformanceMetric,
  type PerformanceMetric,
} from '../../services/performanceMetrics';

let previousShutdownLoaded = false;

async function loadPreviousShutdownMetrics(): Promise<void> {
  if (previousShutdownLoaded) return;
  previousShutdownLoaded = true;
  const previous = await window.traccion?.getLastShutdownPerformance?.();
  if (!previous) return;
  recordPerformanceMetric('cierre', 'Cierre anterior: total', previous.totalMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: backup de cierre', previous.shutdownBackupMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: VACUUM programado', previous.vacuumMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: cerrar SQLite', previous.closeDatabaseMs);
}

function severity(durationMs: number): string {
  if (durationMs >= 1000) return 'text-red-300';
  if (durationMs >= 400) return 'text-amber-300';
  return 'text-metro-success';
}

export function PerformanceDiagnostics() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(() => getPerformanceMetrics());

  useEffect(() => {
    void loadPreviousShutdownMetrics();
    return subscribePerformanceMetrics(() => setMetrics(getPerformanceMetrics()));
  }, []);

  const slowest = useMemo(
    () => [...metrics].sort((a, b) => b.durationMs - a.durationMs).slice(0, 12),
    [metrics],
  );

  return (
    <details className="ui-accordion group scroll-mt-4" id="ajustes-rendimiento">
      <summary className="ui-accordion__summary">
        <div className="flex min-w-0 items-center gap-3">
          <span className="ui-shortcut-card__icon"><Activity size={17} /></span>
          <div>
            <h3 className="text-base font-bold text-metro-text">Diagnóstico de rendimiento</h3>
            <p className="mt-0.5 text-xs text-metro-muted">Mediciones de esta sesión para detectar lentitud real antes de optimizar.</p>
          </div>
        </div>
      </summary>
      <div className="border-t border-metro-border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-metro-muted">Se muestran las operaciones más lentas. Las métricas normales son temporales; el último cierre se conserva solo para diagnosticar el siguiente arranque.</p>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-text hover:bg-metro-surface" onClick={clearPerformanceMetrics} type="button">
            <Trash2 size={14} /> Limpiar
          </button>
        </div>
        {slowest.length === 0 ? (
          <p className="rounded-lg border border-metro-border bg-metro-surface p-3 text-xs text-metro-muted">Todavía no hay mediciones. Navega por varios módulos y vuelve a este apartado.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-metro-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-metro-surface text-metro-muted"><tr><th className="px-3 py-2">Operación</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2 text-right">Tiempo</th></tr></thead>
              <tbody className="divide-y divide-metro-border">
                {slowest.map((metric) => <tr key={metric.id}><td className="px-3 py-2 font-medium text-metro-text">{metric.label}</td><td className="px-3 py-2 capitalize text-metro-muted">{metric.category}</td><td className={`px-3 py-2 text-right font-bold ${severity(metric.durationMs)}`}>{metric.durationMs} ms</td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}
