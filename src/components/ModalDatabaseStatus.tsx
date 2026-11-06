import { useEffect, useMemo, useState } from 'react';
import { useDatabaseStatus } from '../services/databaseStatus';
import { useDatabaseConnectivityState } from '../services/databaseConnectivityState';
import { useEditingAvailability } from '../services/editingAvailability';
import { resolveEditorDatabaseIndicator } from '../services/editorDatabaseIndicator';
import { buildDatabaseStatusBadge } from '../services/databaseStatusView';
import {
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from '../services/persistence';
import { StatusBadge } from './ui/StatusBadge';
import { DatabaseHealthIcon } from './ui/DatabaseHealthIcon';

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

  return 'Guardado';
}

export function ModalDatabaseStatus() {
  const databaseStatus = useDatabaseStatus();
  const connectivity = useDatabaseConnectivityState();
  const editing = useEditingAvailability();
  const databaseBadge = useMemo(() => resolveEditorDatabaseIndicator(
    buildDatabaseStatusBadge(databaseStatus),
    connectivity.phase,
    editing.connectivityBlocked,
    connectivity.message,
  ), [databaseStatus, connectivity.phase, connectivity.message, editing.connectivityBlocked]);
  const [feedback, setFeedback] = useState<PersistenceFeedback | null>(null);

  useEffect(() => subscribeToPersistenceFeedback(setFeedback), []);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2" aria-label="Estado de base de datos del popup">
      <DatabaseHealthIcon status={databaseBadge} />
      {!editing.connectivityBlocked && connectivity.phase !== 'reconnecting' && connectivity.phase !== 'syncing' && feedback && feedback.kind !== 'saved' && (
        <StatusBadge className="max-w-[9rem]" size="xs" tone={feedbackTone(feedback.kind)}>
          {feedbackLabel(feedback)}
        </StatusBadge>
      )}
    </div>
  );
}
