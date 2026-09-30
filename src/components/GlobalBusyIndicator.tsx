import { AlertTriangle, Check, Database } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  isPersistenceFeedbackSilent,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const SAVED_VISIBLE_MS = 1600;
const ERROR_VISIBLE_MS = 4000;
const SLOW_SAVE_MS = 3000;
const MAX_OPERATION_VISIBLE_MS = 30000;
const UNKNOWN_OPERATION_KEY = '__global__';

type IndicatorState = {
  kind: 'saving' | 'saved' | 'error';
  message: string;
  slow: boolean;
};

function feedbackOperationKey(feedback: PersistenceFeedback): string {
  return feedback.key ?? UNKNOWN_OPERATION_KEY;
}

function savingMessage(feedback: PersistenceFeedback): string {
  const message = feedback.message?.trim();
  if (!message) return 'Guardando cambios…';
  return message.replace(/\.\.\.$/, '…').replace(/ en SQLite…?$/i, '…');
}

export function GlobalBusyIndicator() {
  const [state, setState] = useState<IndicatorState | null>(null);
  const pendingOperationsRef = useRef<Set<string>>(new Set());
  const safetyTimeoutsRef = useRef<Map<string, number>>(new Map());
  const slowTimeoutRef = useRef<number | null>(null);
  const completionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const pendingOperations = pendingOperationsRef.current;
    const safetyTimeouts = safetyTimeoutsRef.current;

    const clearSlowTimeout = () => {
      if (slowTimeoutRef.current !== null) {
        window.clearTimeout(slowTimeoutRef.current);
        slowTimeoutRef.current = null;
      }
    };
    const clearCompletionTimeout = () => {
      if (completionTimeoutRef.current !== null) {
        window.clearTimeout(completionTimeoutRef.current);
        completionTimeoutRef.current = null;
      }
    };
    const clearSafetyTimeout = (key: string) => {
      const timeout = safetyTimeouts.get(key);
      if (typeof timeout === 'number') window.clearTimeout(timeout);
      safetyTimeouts.delete(key);
    };
    const scheduleSlowState = () => {
      clearSlowTimeout();
      slowTimeoutRef.current = window.setTimeout(() => {
        if (pendingOperations.size > 0) {
          setState((current) => current?.kind === 'saving' ? { ...current, slow: true } : current);
        }
      }, SLOW_SAVE_MS);
    };

    const unsubscribe = subscribeToPersistenceFeedback((feedback) => {
      if (isPersistenceFeedbackSilent(feedback)) return;

      const key = feedbackOperationKey(feedback);
      clearCompletionTimeout();

      if (feedback.kind === 'saving') {
        pendingOperations.add(key);
        clearSafetyTimeout(key);
        safetyTimeouts.set(key, window.setTimeout(() => {
          pendingOperations.delete(key);
          safetyTimeouts.delete(key);
          if (pendingOperations.size === 0) setState(null);
        }, MAX_OPERATION_VISIBLE_MS));
        setState({ kind: 'saving', message: savingMessage(feedback), slow: false });
        scheduleSlowState();
        return;
      }

      pendingOperations.delete(key);
      clearSafetyTimeout(key);

      if (pendingOperations.size > 0) return;
      clearSlowTimeout();

      if (feedback.kind === 'error') {
        setState({ kind: 'error', message: feedback.message || 'No se han podido guardar los cambios.', slow: false });
        completionTimeoutRef.current = window.setTimeout(() => setState(null), ERROR_VISIBLE_MS);
        return;
      }

      setState({ kind: 'saved', message: 'Cambios guardados', slow: false });
      completionTimeoutRef.current = window.setTimeout(() => setState(null), SAVED_VISIBLE_MS);
    });

    return () => {
      clearSlowTimeout();
      clearCompletionTimeout();
      safetyTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      safetyTimeouts.clear();
      pendingOperations.clear();
      unsubscribe();
    };
  }, []);

  if (!state) return null;

  const label = state.kind === 'saving' && state.slow
    ? 'SQLite está tardando más de lo habitual…'
    : state.message;
  const detail = state.kind === 'saving'
    ? state.slow
      ? 'No cierres la ventana hasta confirmar el guardado.'
      : 'Confirmando el cambio en la base compartida.'
    : state.kind === 'saved'
      ? 'El cambio ha quedado confirmado en SQLite.'
      : 'El cambio no se ha confirmado.';

  return (
    <div className={`global-busy-indicator global-busy-indicator--${state.kind}`} role="status" aria-live="polite" aria-label={label}>
      <div className="global-busy-indicator__panel">
        <span className="global-busy-indicator__icon" aria-hidden="true">
          {state.kind === 'saving' ? <Database size={18} className="global-busy-indicator__database" /> : null}
          {state.kind === 'saved' ? <Check size={19} /> : null}
          {state.kind === 'error' ? <AlertTriangle size={18} /> : null}
        </span>
        <span className="global-busy-indicator__copy">
          <strong>{label}</strong>
          <small>{detail}</small>
        </span>
      </div>
    </div>
  );
}
