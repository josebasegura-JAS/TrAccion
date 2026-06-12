import { useEffect, useRef, useState } from 'react';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const SHOW_DELAY_MS = 350;
const MAX_OPERATION_VISIBLE_MS = 12000;
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
  const operationTimeoutsRef = useRef<Map<string, number>>(new Map());
  const showTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const pendingOperations = pendingOperationsRef.current;
    const operationTimeouts = operationTimeoutsRef.current;

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

    const clearOperationTimeout = (operationKey: string): void => {
      const timeout = operationTimeouts.get(operationKey);
      if (typeof timeout === 'number') {
        window.clearTimeout(timeout);
        operationTimeouts.delete(operationKey);
      }
    };

    const completeOperation = (operationKey: string): void => {
      pendingOperations.delete(operationKey);
      clearOperationTimeout(operationKey);
      hideIfIdle();
    };

    const scheduleOperationSafetyTimeout = (operationKey: string): void => {
      clearOperationTimeout(operationKey);
      const timeout = window.setTimeout(() => {
        pendingOperations.delete(operationKey);
        operationTimeouts.delete(operationKey);
        hideIfIdle();
      }, MAX_OPERATION_VISIBLE_MS);
      operationTimeouts.set(operationKey, timeout);
    };

    const unsubscribe = subscribeToPersistenceFeedback((feedback) => {
      const operationKey = feedbackOperationKey(feedback);

      if (feedback.kind !== 'saving') {
        completeOperation(operationKey);
        return;
      }

      pendingOperations.add(operationKey);
      scheduleOperationSafetyTimeout(operationKey);

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
      operationTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      operationTimeouts.clear();
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
