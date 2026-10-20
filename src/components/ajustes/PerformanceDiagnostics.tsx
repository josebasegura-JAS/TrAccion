import { useEffect, useMemo, useState } from 'react';
import { Activity, ClipboardCopy, Trash2 } from 'lucide-react';
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
  const previous = await window.traccion?.getLastShutdownPerformance?.();
  if (!previous) return;
  previousShutdownLoaded = true;
  if (previous.totalMs === 0 && previous.vacuumMs === 0 && previous.shutdownBackupMs === 0 && previous.closeDatabaseMs === 0) {
    recordPerformanceMetric('cierre', 'Cierre anterior: iniciado pero no completado', 0);
    return;
  }
  recordPerformanceMetric('cierre', 'Cierre anterior: total', previous.totalMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: backup de cierre', previous.shutdownBackupMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: VACUUM programado', previous.vacuumMs);
  recordPerformanceMetric('cierre', 'Cierre anterior: cerrar SQLite', previous.closeDatabaseMs);
  if (typeof previous.shutdownBackupPrepareMs === 'number') recordPerformanceMetric('cierre', 'Cierre anterior: preparar backup', previous.shutdownBackupPrepareMs);
  if (typeof previous.shutdownBackupJsonMs === 'number') recordPerformanceMetric('cierre', 'Cierre anterior: backup JSON local', previous.shutdownBackupJsonMs);
  if (typeof previous.shutdownBackupLocalSqliteMs === 'number') recordPerformanceMetric('cierre', 'Cierre anterior: copia SQLite local', previous.shutdownBackupLocalSqliteMs);
  if (typeof previous.shutdownBackupSharedSqliteMs === 'number') recordPerformanceMetric('cierre', 'Cierre anterior: copia SQLite compartida', previous.shutdownBackupSharedSqliteMs);
  if (typeof previous.shutdownBackupDailySqliteMs === 'number') recordPerformanceMetric('cierre', 'Cierre anterior: copia SQLite diaria', previous.shutdownBackupDailySqliteMs);
}

function severity(durationMs: number): string {
  if (durationMs >= 1000) return 'text-red-300';
  if (durationMs >= 400) return 'text-amber-300';
  return 'text-metro-success';
}

export function PerformanceDiagnostics() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>(() => getPerformanceMetrics());
  const [startup, setStartup] = useState<TraccionStartupPerformance | null>(null);
  const [copyState, setCopyState] = useState('');
  useEffect(() => {
    void window.traccion?.getStartupPerformance?.().then(setStartup).catch(() => setStartup(null));
  }, []);
  const startupSteps = startup?.steps ?? [];
  const startupTotal = startupSteps.find((step) => step.label === 'Dashboard visible')?.elapsedMs;

  useEffect(() => {
    const unsubscribe = subscribePerformanceMetrics(() => setMetrics(getPerformanceMetrics()));
    void loadPreviousShutdownMetrics().then(() => setMetrics(getPerformanceMetrics()));
    return unsubscribe;
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
        <section className="mb-5 rounded-lg border border-metro-border bg-metro-surface p-3" aria-label="Rendimiento de arranque">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-metro-text">Rendimiento de arranque · Último inicio</h4>
              <p className="text-xs text-metro-muted">Desde la entrada en Electron hasta que el dashboard es visible; no incluye la extracción inicial del EXE portable por Windows.</p>
            </div>
            <button type="button" className="rounded-lg border border-metro-border px-2.5 py-1.5 text-xs font-semibold text-metro-text" disabled={!startup}
              onClick={() => {
                if (!startup) return;
                const report = [`TrAcción · Arranque ${startup.kind} · ${startup.recordedAt}`, startup.measuredFrom,
                  ...startupSteps.map((step) => `${step.label}: ${step.elapsedMs} ms`)].join('\n');
                void navigator.clipboard.writeText(report).then(() => setCopyState('Informe copiado')).catch(() => setCopyState('No se pudo copiar'));
              }}><ClipboardCopy size={13} className="mr-1 inline" /> Copiar informe</button>
          </div>
          {copyState && <p className="mb-2 text-xs text-metro-muted">{copyState}</p>}
          {startup ? (
            <>
              <p className="mb-2 text-sm font-semibold text-metro-text">
                Inicio {startup.kind} · {startupTotal === undefined ? 'Inicio aún sin completar' : `${startupTotal} ms hasta dashboard visible`}
              </p>
              <table className="w-full text-left text-xs"><thead><tr><th className="py-1">Etapa</th><th className="py-1 text-right">Acumulado</th><th className="py-1 text-right">Desde anterior</th></tr></thead>
                <tbody>{startupSteps.map((step, index) => <tr key={`${step.label}-${index}`} className="border-t border-metro-border">
                  <td className="py-1.5">{step.label}</td><td className="py-1.5 text-right">{step.elapsedMs} ms</td>
                  <td className="py-1.5 text-right">{index === 0 ? '—' : `${Math.max(0, step.elapsedMs - startupSteps[index - 1].elapsedMs)} ms`}</td>
                </tr>)}</tbody>
              </table>
              <p className="mt-2 text-xs text-metro-muted">Las operaciones paralelas se muestran por su instante de finalización. El intervalo entre marcas no siempre corresponde únicamente a esa operación.</p>
            </>
          ) : <p className="text-xs text-metro-muted">Diagnóstico no disponible fuera de Electron.</p>}
        </section>
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
