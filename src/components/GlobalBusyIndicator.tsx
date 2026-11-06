import { AlertTriangle, Check, Database } from 'lucide-react';
import { isConflictFeedback } from '../services/persistenceNotificationPolicy';
import { useEffect, useRef, useState } from 'react';
import {
  isPersistenceFeedbackSilent,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const SAVED_VISIBLE_MS = 1600;
const ERROR_VISIBLE_MS = 7000;
const SLOW_SAVE_MS = 3000;
const MAX_OPERATION_VISIBLE_MS = 30000;
const UNKNOWN_OPERATION_KEY = '__global__';

type IndicatorState = {
  kind: 'saving' | 'saved' | 'error' | 'conflict' | 'unknown';
  message: string;
  slow: boolean;
  readError?: boolean;
};

function feedbackOperationKey(feedback: PersistenceFeedback): string {
  return feedback.key ?? UNKNOWN_OPERATION_KEY;
}

function savingMessage(feedback: PersistenceFeedback): string {
  const message = feedback.message?.trim();
  if (!message) return 'Guardando cambios…';
  return message.replace(/\.\.\.$/, '…').replace(/ en SQLite…?$/i, '…');
}

function pageHasInlineSaveFeedback(): boolean {
  return typeof document !== 'undefined'
    && Boolean(document.querySelector('[data-inline-save-feedback="true"]'));
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
          // El plazo de visibilidad no confirma ni cancela la operación.
          // Conservamos la clave pendiente hasta recibir un resultado real.
          safetyTimeouts.delete(key);
          setState((current) => current?.kind === 'error' || current?.kind === 'conflict'
            ? current
            : { kind: 'unknown', message: 'El guardado sigue pendiente de confirmación…', slow: true });
        }, MAX_OPERATION_VISIBLE_MS));
        setState({ kind: 'saving', message: savingMessage(feedback), slow: false });
        scheduleSlowState();
        return;
      }

      pendingOperations.delete(key);
      clearSafetyTimeout(key);

      if (feedback.kind === 'error') {
        clearSlowTimeout();
        if (isConflictFeedback(feedback)) {
          setState({ kind: 'conflict', message: feedback.message, slow: false });
          completionTimeoutRef.current = window.setTimeout(() => {
            setState(pendingOperations.size > 0
              ? { kind: 'unknown', message: 'Hay operaciones pendientes de confirmación…', slow: true }
              : null);
          }, ERROR_VISIBLE_MS);
          return;
        }
        setState({
          kind: 'error',
          message: feedback.message || (feedback.operation === 'read' ? 'No se han podido actualizar los datos.' : 'No se han podido guardar los cambios.'),
          slow: false,
          readError: feedback.operation === 'read',
        });
        completionTimeoutRef.current = window.setTimeout(() => {
            setState(pendingOperations.size > 0
              ? { kind: 'unknown', message: 'Hay operaciones pendientes de confirmación…', slow: true }
              : null);
          }, ERROR_VISIBLE_MS);
        return;
      }

      if (pendingOperations.size > 0) {
        // El éxito de otra clave no confirma los guardados aún pendientes.
        setState({ kind: 'saving', message: 'Hay cambios pendientes de guardado…', slow: true });
        return;
      }
      clearSlowTimeout();

      // Si la pantalla ya incorpora InlineSaveFeedback, la confirmación final
      // se muestra allí. El indicador global no repite el mismo "Guardado".
      if (pageHasInlineSaveFeedback()) {
        setState(null);
        return;
      }

      setState({ kind: 'saved', message: 'Guardado', slow: false });
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
    ? 'El guardado está tardando más de lo habitual…'
    : state.message;
  const detail = state.kind === 'saving'
    ? state.slow
      ? 'No cierres la ventana hasta que termine.'
      : 'Guardando los cambios.'
    : state.kind === 'error'
      ? state.readError ? 'Se conserva la última información cargada.' : 'El cambio no se ha guardado.'
      : state.kind === 'conflict' ? 'No se ha sobrescrito la versión de otra persona.'
        : state.kind === 'unknown' ? 'No cierres la ventana: todavía no hay confirmación del resultado.'
          : null;
  const isError = state.kind === 'error' || state.kind === 'conflict' || state.kind === 'unknown';

  return (
    <div
      aria-label={label}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`global-busy-indicator global-busy-indicator--${state.kind}`}
      role={isError ? 'alert' : 'status'}
    >
      <div className="global-busy-indicator__panel">
        <span className="global-busy-indicator__icon" aria-hidden="true">
          {state.kind === 'saving' || state.kind === 'unknown' ? <Database size={18} className="global-busy-indicator__database" /> : null}
          {state.kind === 'saved' ? <Check size={19} /> : null}
          {state.kind === 'error' || state.kind === 'conflict' ? <AlertTriangle size={18} /> : null}
        </span>
        <span className="global-busy-indicator__copy">
          <strong>{label}</strong>
          {detail ? <small>{detail}</small> : null}
        </span>
      </div>
    </div>
  );
}
