import { useEffect, useRef, useState } from 'react';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const SHOW_DELAY_MS = 350;
const UNKNOWN_OPERATION_KEY = '__global__';

type BusyState = {
  active: boolean;
  message: string;
};

function feedbackOperationKey(feedback: PersistenceFeedback): string {
  return feedback.key ?? UNKNOWN_OPERATION_KEY;
}

function buildBusyMessage(feedback: PersistenceFeedback): string {
  if (feedback.message && feedback.message.trim().length > 0) {
    return feedback.message.replace(/\.\.\.$/, '…');
  }

  return 'Guardando cambios…';
}

export function GlobalBusyIndicator() {
  const [busyState, setBusyState] = useState<BusyState>({
    active: false,
    message: 'Guardando cambios…',
  });
  const pendingOperationsRef = useRef<Set<string>>(new Set());
  const showTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
  const pendingOperations = pendingOperationsRef.current;
    const clearShowTimeout = (): void => {
      if (showTimeoutRef.current !== null) {
        window.clearTimeout(showTimeoutRef.current);
        showTimeoutRef.current = null;
      }
    };

    const hideIfIdle = (): void => {
      if (pendingOperations.size === 0) {
        clearShowTimeout();
        setBusyState((current) => ({ ...current, active: false }));
      }
    };

    const unsubscribe = subscribeToPersistenceFeedback((feedback) => {
      const operationKey = feedbackOperationKey(feedback);

      if (feedback.kind !== 'saving') {
        pendingOperations.delete(operationKey);
        hideIfIdle();
        return;
      }

      pendingOperations.add(operationKey);
      const message = buildBusyMessage(feedback);
      clearShowTimeout();
      showTimeoutRef.current = window.setTimeout(() => {
        if (pendingOperations.size > 0) {
          setBusyState({ active: true, message });
        }
        showTimeoutRef.current = null;
      }, SHOW_DELAY_MS);
    });

    return () => {
      clearShowTimeout();
      pendingOperations.clear();
      unsubscribe();
    };
  }, []);

  if (!busyState.active) {
    return null;
  }

  return (
    <div
      className="global-busy-indicator"
      role="status"
      aria-live="polite"
      aria-label={busyState.message}
    >
      <div className="global-busy-indicator__panel">
        <span className="global-busy-indicator__spinner" aria-hidden="true" />
        <span>{busyState.message}</span>
      </div>
    </div>
  );
}
