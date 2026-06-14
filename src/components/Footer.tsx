import { Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';
import { useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge, databaseStatusBadgeClassName } from '../services/databaseStatusView';

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
  const databaseStatus = useDatabaseStatus();
  const databaseBadge = useMemo(() => buildDatabaseStatusBadge(databaseStatus), [databaseStatus]);

  useEffect(() => subscribeToPersistenceFeedback(setFeedback), []);

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between gap-3 border-t border-white/10 bg-black/10 px-3 text-[11px] text-slate-400">
      <span className="shrink-0">TrAccion 1.0.{build}</span>
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`inline-flex max-w-[15rem] items-center gap-1.5 truncate rounded-full border px-2 py-0.5 font-semibold ${databaseStatusBadgeClassName(databaseBadge.tone)}`}
          title={databaseBadge.title}
        >
          <Database size={12} className="shrink-0" />
          <span className="truncate">{databaseBadge.label}</span>
        </span>
        <span className={`${feedbackClassName(feedback.kind)} truncate font-semibold`}>
          {feedbackLabel(feedback)}
        </span>
      </div>
    </footer>
  );
}
