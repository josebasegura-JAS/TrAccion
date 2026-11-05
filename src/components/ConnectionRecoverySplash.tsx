import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock3, Database, LoaderCircle, RotateCw, WifiOff } from 'lucide-react';
import { useDatabaseConnectivityState } from '../services/databaseConnectivityState';
import { getConnectionDiagnostics, subscribeConnectionDiagnostics } from '../services/databaseHealthMonitor';

import { getRecoveryStepStatuses } from './connectionRecoverySteps';

/**
 * Presentación a pantalla completa: el monitor de SQLite es el único que puede
 * confirmar el fin de la recuperación. No modifica tokens, stores ni bloqueos.
 */
export function ConnectionRecoverySplash() {
  const connectivity = useDatabaseConnectivityState();
  const [diagnostics, setDiagnostics] = useState(getConnectionDiagnostics);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');

  const active = connectivity.phase === 'reconnecting' || connectivity.phase === 'syncing';
  useEffect(() => subscribeConnectionDiagnostics(() => setDiagnostics(getConnectionDiagnostics())), []);
  useEffect(() => {
    if (!active) {
      setStartedAt(null);
      setElapsed(0);
      setRestartError('');
      return;
    }
    // La marca permanece estable al cambiar de reconectando a sincronizando.
    setStartedAt((current) => current ?? Date.now());
  }, [active]);
  useEffect(() => {
    if (!active || startedAt === null) return;
    const tick = () => setElapsed(Math.max(0, Date.now() - startedAt));
    tick();
    const timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  useEffect(() => {
    if (!active) return;
    const overlay = document.querySelector('[data-traccion-recovery-overlay]');
    if (!overlay) return;
    // Los formularios y borradores siguen montados, pero la navegación,
    // accesos por teclado y portales de diálogos quedan inertes.
    const original = new Map<HTMLElement, boolean>();
    const block = () => {
      Array.from(document.body.children).forEach((child) => {
        if (!(child instanceof HTMLElement) || child === overlay || original.has(child)) return;
        original.set(child, child.inert);
        child.inert = true;
      });
    };
    block();
    const observer = new MutationObserver(block);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      original.forEach((wasInert, element) => { element.inert = wasInert; });
    };
  }, [active]);

  if (!active) return null;
  const phase = connectivity.phase === 'syncing' ? 'syncing' : 'reconnecting';
  const statuses = getRecoveryStepStatuses(phase);
  const canRestart = diagnostics.consecutiveFailures >= 5 || elapsed >= 30_000;
  const elapsedSeconds = Math.floor(elapsed / 1_000);
  const handleRestart = async () => {
    if (!window.traccion?.requestSafeRestart || restarting) return;
    setRestarting(true);
    setRestartError('');
    try {
      const result = await window.traccion.requestSafeRestart();
      if (!result.ok) setRestartError(result.message ?? 'El reinicio no se ha podido completar.');
    } catch (error) {
      setRestartError(error instanceof Error ? error.message : 'No se ha podido solicitar el reinicio.');
    } finally {
      setRestarting(false);
    }
  };

  return createPortal(
    <section
      data-traccion-recovery-overlay=""
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-splash-title"
      aria-describedby="recovery-splash-description"
      className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-y-auto bg-[#0f1f2a] p-4 text-[#f7fbfd]"
      style={{ background: 'radial-gradient(circle at 30% 18%, rgba(214,35,53,.20), transparent 31%), linear-gradient(145deg, #132836 0%, #0d1a24 56%, #081119 100%)' }}
    >
      <div className="w-full max-w-[460px] rounded-[28px] border border-white/10 bg-[#0c1822]/95 px-6 py-6 shadow-2xl sm:px-7">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-[74px] w-[74px] shrink-0 items-center justify-center rounded-2xl bg-white/[.045]">
            <Database size={42} className="text-white/90" aria-hidden="true" />
          </div>
          <div>
            <h1 id="recovery-splash-title" className="text-[28px] font-extrabold tracking-wide">TrAcción</h1>
            <p className="text-xs font-semibold uppercase tracking-widest text-white/55">Relaciones Laborales</p>
          </div>
        </div>
        <div className="mb-4 flex items-start gap-3">
          {phase === 'reconnecting'
            ? <WifiOff className="mt-0.5 shrink-0 text-[#f07882]" size={22} aria-hidden="true" />
            : <Clock3 className="mt-0.5 shrink-0 text-[#f5be56]" size={22} aria-hidden="true" />}
          <div>
            <h2 className="text-base font-semibold">{phase === 'syncing' ? 'Recuperando datos compartidos' : 'Conexión interrumpida'}</h2>
            <p id="recovery-splash-description" className="mt-1 text-xs leading-5 text-white/65">
              TrAcción está comprobando la conexión con la base compartida. La aplicación permanecerá bloqueada hasta que termine la recuperación.
            </p>
          </div>
        </div>
        <div className="grid gap-2" aria-label="Estado de recuperación">
          {STEPS.map((label, index) => {
            const status = statuses[index];
            return (
              <div key={label} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 ${status === 'done' ? 'border-emerald-400/15 bg-emerald-400/[.055]' : status === 'active' ? 'border-[#d62335]/40 bg-[#d62335]/10' : 'border-white/[.06] bg-white/[.025]'}`}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden="true">
                  {status === 'done' ? <Check size={17} className="text-emerald-400" /> : status === 'active' ? <LoaderCircle size={18} className="animate-spin text-[#f07882]" /> : <span className="h-1.5 w-1.5 rounded-full bg-white/25" />}
                </span>
                <span className="min-w-0 flex-1 text-xs font-medium text-white/85">{label}</span>
                <span className="text-[10px] text-white/45">{status === 'done' ? 'Hecho' : status === 'active' ? 'En curso' : 'Pendiente'}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-white/50">
          <span role="status" aria-live="polite">{phase === 'syncing' ? 'Sincronizando información…' : 'Reintentando conexión automáticamente…'}</span>
          <span className="tabular-nums">{elapsedSeconds} s</span>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
          <div className={`h-full rounded-full bg-gradient-to-r from-[#8f1724] via-[#d62335] to-[#ff6c78] transition-all duration-300 ${phase === 'syncing' ? 'w-3/4' : 'w-2/5'}`} />
        </div>
        {canRestart && <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-3 text-xs text-white/65">La reconexión está tardando más de lo habitual. Puedes seguir esperando o solicitar un reinicio seguro.</p>
          <button type="button" onClick={() => void handleRestart()} disabled={restarting || !window.traccion?.requestSafeRestart}
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold hover:bg-white/10 disabled:opacity-50">
            <RotateCw size={15} aria-hidden="true" />{restarting ? 'Preparando reinicio…' : 'Reiniciar TrAcción'}
          </button>
        </div>}
        {restartError && <p role="alert" className="mt-3 text-xs text-[#ff8a91]">{restartError}</p>}
        <p className="mt-4 text-[11px] text-white/45">Los formularios abiertos permanecen en pantalla y no se pueden utilizar hasta recuperar la conexión.</p>
      </div>
    </section>,
    document.body,
  );
}
