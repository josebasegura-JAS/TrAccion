import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const MIN_VISIBLE_MS = 900;
const QUIET_MS = 650;
const MAX_VISIBLE_MS = 8000;

function findSettingsRoot(): HTMLElement | null {
  const databaseDetails = document.getElementById('ajustes-base-datos');
  if (!databaseDetails) {
    return null;
  }

  return databaseDetails.closest('section') ?? databaseDetails.parentElement;
}

export function SafeSettingsLoadingIndicator() {
  const [visible, setVisible] = useState(false);
  const activeRootRef = useRef<HTMLElement | null>(null);
  const shownAtRef = useRef(0);
  const quietTimerRef = useRef<number | null>(null);
  const hardStopTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (quietTimerRef.current !== null) {
        window.clearTimeout(quietTimerRef.current);
        quietTimerRef.current = null;
      }
      if (hardStopTimerRef.current !== null) {
        window.clearTimeout(hardStopTimerRef.current);
        hardStopTimerRef.current = null;
      }
    };

    const hide = () => {
      clearTimers();
      setVisible(false);
      activeRootRef.current = null;
    };

    const scheduleHideAfterQuietPeriod = () => {
      if (quietTimerRef.current !== null) {
        window.clearTimeout(quietTimerRef.current);
      }

      const elapsed = Date.now() - shownAtRef.current;
      const waitForMinimum = Math.max(0, MIN_VISIBLE_MS - elapsed);
      quietTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        quietTimerRef.current = null;
      }, Math.max(QUIET_MS, waitForMinimum));
    };

    const beginSettingsFeedback = (root: HTMLElement) => {
      if (activeRootRef.current === root && visible) {
        scheduleHideAfterQuietPeriod();
        return;
      }

      clearTimers();
      activeRootRef.current = root;
      shownAtRef.current = Date.now();
      setVisible(true);
      scheduleHideAfterQuietPeriod();

      hardStopTimerRef.current = window.setTimeout(() => {
        setVisible(false);
        hardStopTimerRef.current = null;
      }, MAX_VISIBLE_MS);
    };

    let settingsObserver: MutationObserver | null = null;

    const attachToSettingsIfPresent = () => {
      const root = findSettingsRoot();

      if (!root) {
        settingsObserver?.disconnect();
        settingsObserver = null;
        if (activeRootRef.current) {
          hide();
        }
        return;
      }

      if (activeRootRef.current !== root) {
        settingsObserver?.disconnect();
        beginSettingsFeedback(root);

        settingsObserver = new MutationObserver(() => {
          scheduleHideAfterQuietPeriod();
        });
        settingsObserver.observe(root, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
        });
      }
    };

    attachToSettingsIfPresent();

    const pageObserver = new MutationObserver(() => {
      attachToSettingsIfPresent();
    });

    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      pageObserver.disconnect();
      settingsObserver?.disconnect();
      clearTimers();
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-5 top-5 z-[120] flex items-center gap-2.5 rounded-xl border border-sky-400/20 bg-[#0d2035]/95 px-3.5 py-2.5 text-sky-100 shadow-[0_16px_38px_rgba(2,8,23,0.35)] backdrop-blur"
      role="status"
    >
      <LoaderCircle className="animate-spin text-sky-300" size={17} />
      <div>
        <p className="text-xs font-bold">Actualizando configuración…</p>
        <p className="mt-0.5 text-[10px] font-medium text-slate-400">
          Ajustes sigue disponible mientras termina la carga.
        </p>
      </div>
    </div>
  );
}
