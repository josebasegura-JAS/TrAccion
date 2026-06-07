import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const DEFAULT_VISIBLE_MS = 1500;

type InlineSaveFeedbackProps = {
  visibleMs?: number;
};

export function InlineSaveFeedback({ visibleMs = DEFAULT_VISIBLE_MS }: InlineSaveFeedbackProps) {
  const [isVisible, setIsVisible] = useState(false);
  const lastSavedAtRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToPersistenceFeedback((feedback: PersistenceFeedback) => {
      if (feedback.kind !== 'saved' || feedback.updatedAt === lastSavedAtRef.current) {
        return;
      }

      lastSavedAtRef.current = feedback.updatedAt;
      setIsVisible(true);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
        timeoutRef.current = null;
      }, visibleMs);
    });

    return () => {
      unsubscribe();
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [visibleMs]);

  return (
    <span
      aria-live="polite"
      className={`inline-save-feedback${isVisible ? ' inline-save-feedback--visible' : ''}`}
    >
      <Check size={14} aria-hidden="true" />
      Guardado
    </span>
  );
}
