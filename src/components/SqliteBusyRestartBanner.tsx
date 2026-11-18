import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getConnectionDiagnostics, subscribeConnectionDiagnostics } from '../services/databaseHealthMonitor';

import { shouldSuggestSqliteBusyRestart } from './sqliteBusyRestartPolicy';

export function SqliteBusyRestartBanner() {
  const [diagnostics, setDiagnostics] = useState(getConnectionDiagnostics);
  const [restarting, setRestarting] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => subscribeConnectionDiagnostics(() => setDiagnostics(getConnectionDiagnostics())), []);
  const suggest = shouldSuggestSqliteBusyRestart(diagnostics.busySinceAt, diagnostics.consecutiveBusy, Date.now());

  useEffect(() => {
    if (!suggest && result) setResult('');
  }, [suggest, result]);

  if (!suggest) return null;

  const requestRestart = async () => {
    if (restarting || !window.traccion?.requestSafeRestart) {
      if (!window.traccion?.requestSafeRestart) setResult('El reinicio seguro no está disponible en esta instalación.');
      return;
    }
    setRestarting(true);
    setResult('');
    try {
      const response = await window.traccion.requestSafeRestart();
      if (!response.ok) setResult(response.message || 'No se ha podido iniciar el reinicio seguro.');
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Error al solicitar el reinicio seguro.');
    } finally {
      setRestarting(false);
    }
  };

  return (
    <section className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-metro-text" role="alert">
      <div className="flex flex-wrap items-center gap-3">
        <AlertTriangle size={20} className="shrink-0 text-amber-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <strong>SQLite lleva más de dos minutos ocupada</strong>
          <p className="mt-1 text-xs text-metro-muted">
            TrAcción está detectando bloqueos repetidos en las comprobaciones. Puedes continuar esperando o solicitar un reinicio supervisado. No se reiniciará automáticamente.
          </p>
          {result && <p className="mt-2 text-xs" role="status">{result}</p>}
        </div>
        <button
          type="button"
          disabled={restarting}
          onClick={() => void requestRestart()}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-400/60 px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw size={14} /> {restarting ? 'Comprobando reinicio…' : 'Reiniciar TrAcción'}
        </button>
      </div>
    </section>
  );
}
