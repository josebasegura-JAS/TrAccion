import { Database } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useDatabaseStatus } from '../services/databaseStatus';
import { buildDatabaseStatusBadge, type DatabaseStatusTone } from '../services/databaseStatusView';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';
import { StatusBadge } from './ui/StatusBadge';

function defaultFeedback(): PersistenceFeedback {
  const now = new Date();

  return {
    kind: 'saved',
    updatedAt: now.toISOString(),
    message: `Guardado ${now.toLocaleTimeString('es-ES', { hour12: false })}`,
  };
}

function databaseTone(tone: DatabaseStatusTone): 'success' | 'warning' | 'error' | 'muted' {
  if (tone === 'ok') {
    return 'success';
  }

  if (tone === 'error') {
    return 'error';
  }

  if (tone === 'locked') {
    return 'muted';
  }

  return 'warning';
}

function feedbackTone(kind: PersistenceFeedback['kind']): 'success' | 'warning' | 'error' {
  if (kind === 'saving') {
    return 'warning';
  }

  if (kind === 'error') {
    return 'error';
  }

  return 'success';
}

function feedbackLabel(feedback: PersistenceFeedback): string {
  if (feedback.kind === 'saving') {
    return '⟳ Pensando...';
  }

  if (feedback.kind === 'error') {
    return `✕ ${feedback.message || 'Error BBDD'}`;
  }

  return '✓ Libre';
}

export function ModalDatabaseStatus() {
  const databaseStatus = useDatabaseStatus();
  const databaseBadge = useMemo(() => buildDatabaseStatusBadge(databaseStatus), [databaseStatus]);
  const [feedback, setFeedback] = useState<PersistenceFeedback>(() => defaultFeedback());

  useEffect(() => subscribeToPersistenceFeedback(setFeedback), []);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2" aria-label="Estado de base de datos del popup">
      <StatusBadge
        className="max-w-[10rem]"
        icon={<Database size={12} aria-hidden="true" />}
        size="xs"
        title={databaseBadge.title}
        tone={databaseTone(databaseBadge.tone)}
      >
        {databaseBadge.label}
      </StatusBadge>
      <StatusBadge className="max-w-[9rem]" size="xs" tone={feedbackTone(feedback.kind)}>
        {feedbackLabel(feedback)}
      </StatusBadge>
    </div>
  );
}
