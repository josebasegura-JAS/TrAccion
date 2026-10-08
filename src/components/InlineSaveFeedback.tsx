import { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
  isPersistenceFeedbackSilent,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const DEFAULT_VISIBLE_MS = 1800;

type InlineSaveFeedbackProps = {
  visibleMs?: number;
};

export function InlineSaveFeedback({ visibleMs = DEFAULT_VISIBLE_MS }: InlineSaveFeedbackProps) {
  const [message, setMessage] = useState<string | null>(null);
  const lastUpdatedAtRef = useRef<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearHideTimer = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const unsubscribe = subscribeToPersistenceFeedback((next: PersistenceFeedback) => {
      // El indicador global es el único responsable de "guardando" y "error".
      // Este feedback inline queda reservado a una confirmación final, breve y
      // cercana a la acción que ha realizado el usuario.
      if (
        isPersistenceFeedbackSilent(next) ||
        next.kind !== 'saved' ||
        next.updatedAt === lastUpdatedAtRef.current
      ) {
        return;
      }

      lastUpdatedAtRef.current = next.updatedAt;
      clearHideTimer();
      setMessage(next.message?.trim() || 'Guardado');

      timeoutRef.current = window.setTimeout(() => {
        setMessage(null);
        timeoutRef.current = null;
      }, visibleMs);
    });

    return () => {
      unsubscribe();
      clearHideTimer();
    };
  }, [visibleMs]);

  // El marcador permanece montado para que GlobalBusyIndicator sepa que esta
  // pantalla ya dispone de confirmación inline y no repita el estado "saved".
  if (!message) {
    return <span aria-hidden="true" className="hidden" data-inline-save-feedback="true" />;
  }

  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className="inline-flex max-w-[18rem] items-center gap-1.5 px-1 text-xs font-semibold text-emerald-300"
      data-inline-save-feedback="true"
      role="status"
      title={message}
    >
      <CheckCircle2 aria-hidden="true" size={15} />
      <span>Guardado</span>
    </span>
  );
}
