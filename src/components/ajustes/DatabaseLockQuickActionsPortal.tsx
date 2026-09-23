import { LockKeyhole, RefreshCw, ShieldAlert, UnlockKeyhole } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAppDialog } from '../../hooks/useAppDialog';
import { formatLockAge } from '../../services/databaseLockView';
import { publishDatabaseStatus } from '../../services/databaseStatus';

type LockCheckState = 'idle' | 'checking' | 'ready' | 'error';

export function DatabaseLockQuickActionsPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let mountNode: HTMLDivElement | null = null;

    const ensureTarget = () => {
      const databaseDetails = document.getElementById('ajustes-base-datos');
      const settingsContainer = databaseDetails?.parentElement;

      if (!databaseDetails || !settingsContainer) {
        if (mountNode?.isConnected) {
          mountNode.remove();
        }
        mountNode = null;
        setTarget(null);
        return;
      }

      if (!mountNode || !mountNode.isConnected) {
        const existing = document.getElementById('database-lock-quick-actions-slot');
        if (existing instanceof HTMLDivElement) {
          mountNode = existing;
        } else {
          mountNode = document.createElement('div');
          mountNode.id = 'database-lock-quick-actions-slot';
          settingsContainer.insertBefore(mountNode, databaseDetails);
        }
      }

      setTarget(mountNode);
    };

    ensureTarget();
    const observer = new MutationObserver(ensureTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (mountNode?.isConnected) {
        mountNode.remove();
      }
    };
  }, []);

  return target ? createPortal(<DatabaseLockQuickActions />, target) : null;
}

function DatabaseLockQuickActions() {
  const [currentLock, setCurrentLock] = useState<TraccionDatabaseLockInfo | null>(null);
  const [checkState, setCheckState] = useState<LockCheckState>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [isForcing, setIsForcing] = useState(false);
  const { confirm, dialogNode } = useAppDialog();

  const refreshLock = async () => {
    if (!window.traccion?.getCurrentDatabaseLock) {
      setCheckState('error');
      setStatusMessage('La consulta de bloqueos solo está disponible en la aplicación de escritorio.');
      return;
    }

    setCheckState('checking');
    setStatusMessage('');

    try {
      const lock = await window.traccion.getCurrentDatabaseLock();
      setCurrentLock(lock);
      setCheckState('ready');
      setStatusMessage(
        lock
          ? 'Se ha detectado un bloqueo activo en la base compartida.'
          : 'No hay ningún bloqueo externo activo en este momento.',
      );
    } catch (error) {
      console.warn('No se ha podido comprobar el bloqueo actual de SQLite.', error);
      setCurrentLock(null);
      setCheckState('error');
      setStatusMessage(
        'No se ha podido comprobar el bloqueo. Puede haber un problema temporal de red con la carpeta compartida.',
      );
    }
  };

  useEffect(() => {
    void refreshLock();
  }, []);

  const forceRelease = async () => {
    if (!currentLock || !window.traccion?.forceReleaseDatabaseLock) {
      return;
    }

    const ownerDescription =
      `${currentLock.username}@${currentLock.hostname} · PID ${currentLock.pid} · ` +
      formatLockAge(currentLock.updatedAt);

    const confirmed = await confirm(
      `Vas a eliminar manualmente el bloqueo de ${ownerDescription}. ` +
        'Hazlo únicamente si estás seguro de que ese equipo ya no está trabajando realmente en TrAcción. ' +
        'Si sigue activo, podríais escribir simultáneamente durante unos segundos. ¿Continuar?',
      {
        confirmLabel: 'Forzar liberación',
        danger: true,
        title: 'Liberar bloqueo de base de datos',
      },
    );

    if (!confirmed) {
      return;
    }

    setIsForcing(true);
    setStatusMessage('Liberando bloqueo…');

    try {
      const result = await window.traccion.forceReleaseDatabaseLock();
      publishDatabaseStatus(result.status);

      if (!result.ok) {
        setStatusMessage(result.message || 'No se ha podido liberar el bloqueo.');
        await refreshLock();
        return;
      }

      setCurrentLock(null);
      setCheckState('ready');
      setStatusMessage('Bloqueo liberado. Reiniciando TrAcción…');

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      console.warn('No se ha podido forzar la liberación del bloqueo SQLite.', error);
      setStatusMessage(
        `No se ha podido liberar el bloqueo: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      setCheckState('error');
    } finally {
      setIsForcing(false);
    }
  };

  const hasLock = currentLock !== null;
  const isChecking = checkState === 'checking';

  return (
    <>
      <section
        className={`scroll-mt-4 rounded-[1.3rem] border p-4 ${
          hasLock
            ? 'border-amber-400/30 bg-[linear-gradient(180deg,rgba(89,63,22,0.22),rgba(32,28,22,0.36))]'
            : 'border-emerald-400/20 bg-[linear-gradient(180deg,rgba(17,74,65,0.24),rgba(13,48,46,0.32))]'
        }`}
        id="bloqueos-base-datos"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
                hasLock
                  ? 'border-amber-300/25 bg-amber-500/10 text-amber-200'
                  : 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200'
              }`}
            >
              {hasLock ? <ShieldAlert size={20} /> : <LockKeyhole size={20} />}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-extrabold text-metro-text">
                  Bloqueos de base de datos
                </h3>
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                    hasLock
                      ? 'border-amber-400/25 bg-amber-500/10 text-amber-100'
                      : checkState === 'error'
                        ? 'border-rose-400/25 bg-rose-500/10 text-rose-200'
                        : 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100'
                  }`}
                >
                  {isChecking
                    ? 'Comprobando…'
                    : hasLock
                      ? 'Bloqueo activo'
                      : checkState === 'error'
                        ? 'No comprobado'
                        : 'Sin bloqueo'}
                </span>
              </div>

              <p className="mt-1 text-sm text-metro-muted">
                Permite detectar y liberar un lock abandonado por otro equipo si TrAcción quedó
                bloqueado tras un cierre, caída de red o equipo apagado.
              </p>

              {hasLock && (
                <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5">
                  <p className="text-xs font-bold text-amber-100">
                    {currentLock.username}@{currentLock.hostname}
                  </p>
                  <p className="mt-1 text-xs text-metro-muted">
                    PID {currentLock.pid} · {formatLockAge(currentLock.updatedAt)}
                  </p>
                </div>
              )}

              {statusMessage && (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    checkState === 'error'
                      ? 'text-rose-200'
                      : hasLock
                        ? 'text-amber-200'
                        : 'text-emerald-200'
                  }`}
                >
                  {statusMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-metro-border bg-metro-surface px-3 py-2 text-xs font-bold text-metro-text transition hover:border-sky-400/40 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isChecking || isForcing}
              onClick={() => void refreshLock()}
              type="button"
            >
              <RefreshCw className={isChecking ? 'animate-spin' : ''} size={15} />
              {isChecking ? 'Comprobando…' : 'Comprobar bloqueo'}
            </button>

            <button
              className="inline-flex items-center gap-2 rounded-lg bg-metro-red px-3 py-2 text-xs font-bold text-white transition hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasLock || isChecking || isForcing}
              onClick={() => void forceRelease()}
              title={
                hasLock
                  ? 'Eliminar manualmente el bloqueo detectado'
                  : 'No hay ningún bloqueo confirmado para liberar'
              }
              type="button"
            >
              <UnlockKeyhole size={15} />
              {isForcing ? 'Liberando…' : 'Forzar liberación'}
            </button>
          </div>
        </div>

        <p className="mt-3 border-t border-metro-border/60 pt-3 text-[11px] leading-relaxed text-metro-muted">
          Seguridad: TrAcción solo habilita la liberación cuando puede identificar un lock real.
          Si la red impide leerlo, no se borra a ciegas.
        </p>
      </section>

      {dialogNode}
    </>
  );
}
