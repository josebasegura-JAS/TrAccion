import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, LoaderCircle } from 'lucide-react';
import {
  isPersistenceFeedbackSilent,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
  type PersistenceFeedbackKind,
} from '../services/persistence';

const DEFAULT_VISIBLE_MS = 1500;
const ERROR_VISIBLE_MS = 4500;

type InlineSaveFeedbackProps = {
  visibleMs?: number;
};

type VisibleFeedback = {
  kind: PersistenceFeedbackKind;
  message: string;
};

const toneClassName: Record<PersistenceFeedbackKind, string> = {
  saving: 'border-blue-400/30 bg-blue-500/10 text-blue-100',
  saved: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  error: 'border-red-500/30 bg-red-500/10 text-red-200',
};

function defaultMessage(kind: PersistenceFeedbackKind): string {
  if (kind === 'saving') return 'Guardando…';
  if (kind === 'error') return 'Error al guardar';
  return 'Guardado';
}

export function InlineSaveFeedback({ visibleMs = DEFAULT_VISIBLE_MS }: InlineSaveFeedbackProps) {
  const [feedback, setFeedback] = useState<VisibleFeedback | null>(null);
  const lastUpdatedAtRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleHide = (delay: number) => {
      clearHideTimer();
      timeoutRef.current = window.setTimeout(() => {
        setFeedback(null);
        timeoutRef.current = null;
      }, delay);
    };

    const unsubscribe = subscribeToPersistenceFeedback((next: PersistenceFeedback) => {
      if (
        isPersistenceFeedbackSilent(next) ||
        next.updatedAt === lastUpdatedAtRef.current
      ) {
        return;
      }

      lastUpdatedAtRef.current = next.updatedAt;
      clearHideTimer();

      setFeedback({
        kind: next.kind,
        message: next.message?.trim() || defaultMessage(next.kind),
      });

      if (next.kind === 'saved') {
        scheduleHide(visibleMs);
      } else if (next.kind === 'error') {
        scheduleHide(ERROR_VISIBLE_MS);
      }
    });

    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, [visibleMs]);

  if (!feedback) return null;

  const assertive = feedback.kind === 'error';

  return (
    <span
      aria-atomic="true"
      aria-live={assertive ? 'assertive' : 'polite'}
      className={`inline-flex max-w-[28rem] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClassName[feedback.kind]}`}
      role={assertive ? 'alert' : 'status'}
      title={feedback.message}
    >
      {feedback.kind === 'saving' ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" size={14} />
      ) : feedback.kind === 'error' ? (
        <AlertTriangle aria-hidden="true" size={14} />
      ) : (
        <Check aria-hidden="true" size={14} />
      )}
      <span className="truncate">
        {feedback.kind === 'saved' ? 'Guardado' : feedback.message}
      </span>
    </span>
  );
}
