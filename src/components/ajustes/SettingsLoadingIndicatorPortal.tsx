import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  getSettingsQueryState,
  subscribeSettingsQueryState,
} from '../../services/settingsProgressiveLoading';

const SHOW_DELAY_MS = 800;

export function SettingsLoadingIndicatorPortal() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [activeQueries, setActiveQueries] = useState(
    () => getSettingsQueryState().activeQueries,
  );
  const [showIndicator, setShowIndicator] = useState(false);

  useEffect(() => subscribeSettingsQueryState((state) => {
    setActiveQueries(state.activeQueries);
  }), []);

  useEffect(() => {
    let mountNode: HTMLDivElement | null = null;

    const ensureTarget = () => {
      const details = document.getElementById('ajustes-base-datos');
      const settingsSection = details?.parentElement;

      if (!details || !settingsSection) {
        if (mountNode?.isConnected) mountNode.remove();
        mountNode = null;
        setTarget(null);
        return;
      }

      if (!mountNode || !mountNode.isConnected) {
        const existing = document.getElementById('settings-loading-indicator-slot');
        if (existing instanceof HTMLDivElement) {
          mountNode = existing;
        } else {
          mountNode = document.createElement('div');
          mountNode.id = 'settings-loading-indicator-slot';
          settingsSection.insertBefore(mountNode, settingsSection.firstChild);
        }
      }

      setTarget(mountNode);
    };

    ensureTarget();
    const observer = new MutationObserver(ensureTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (mountNode?.isConnected) mountNode.remove();
    };
  }, []);

  useEffect(() => {
    if (activeQueries <= 0) {
      setShowIndicator(false);
      return;
    }

    const timer = window.setTimeout(() => {
      setShowIndicator(true);
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [activeQueries]);

  if (!target || !showIndicator) {
    return null;
  }

  return createPortal(
    <div
      aria-live="polite"
      className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-sky-400/20 bg-sky-500/[0.08] px-3.5 py-2.5 text-sky-100 shadow-sm"
      role="status"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <LoaderCircle className="shrink-0 animate-spin text-sky-300" size={17} />
        <div className="min-w-0">
          <p className="text-xs font-bold text-sky-100">Actualizando configuración…</p>
          <p className="mt-0.5 truncate text-[11px] text-metro-muted">
            Puedes seguir usando Ajustes mientras se completan las consultas.
          </p>
        </div>
      </div>

      <span className="hidden rounded-full border border-sky-400/15 bg-sky-500/[0.08] px-2 py-1 text-[10px] font-bold text-sky-200 sm:inline-flex">
        En segundo plano
      </span>
    </div>,
    target,
  );
}
