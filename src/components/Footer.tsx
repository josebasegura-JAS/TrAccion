import { useEffect, useState } from 'react';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';

const build = (() => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
})();

function defaultFeedback(): PersistenceFeedback {
  const now = new Date();
  return {
    kind: 'saved',
    updatedAt: now.toISOString(),
    message: `Guardado ${now.toLocaleTimeString('es-ES', { hour12: false })}`,
  };
}

function feedbackClassName(kind: PersistenceFeedback['kind']): string {
  if (kind === 'saving') {
    return 'text-amber-300';
  }

  if (kind === 'error') {
    return 'text-red-400';
  }

  return 'text-emerald-400';
}

function feedbackLabel(feedback: PersistenceFeedback): string {
  if (feedback.kind === 'saving') {
    return '⟳ Guardando...';
  }

  if (feedback.kind === 'error') {
    return `✕ ${feedback.message || 'Error de guardado'}`;
  }

  return `✓ ${feedback.message}`;
}

export function Footer() {
  const [feedback, setFeedback] = useState<PersistenceFeedback>(() => defaultFeedback());

  useEffect(() => subscribeToPersistenceFeedback(setFeedback), []);

  return (
    <footer className="flex h-6 items-center justify-between border-t border-white/10 bg-black/10 px-3 text-[11px] text-slate-400">
      <span>TrAccion 1.0.{build}</span>
      <span className={feedbackClassName(feedback.kind)}>{feedbackLabel(feedback)}</span>
    </footer>
  );
}
