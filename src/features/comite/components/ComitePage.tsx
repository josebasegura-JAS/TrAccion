import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { COMITE_SESSION_CONFIG } from '../domain/comite';
import { useCommitteeSessionStore } from '../store/useCommitteeSessionStore';

export function ComitePage({
  initialSessionId = null,
  navigationNonce,
}: {
  initialSessionId?: string | null;
  navigationNonce?: number;
}) {
  const createActaFromSession = useActasStore((state) => state.createFromSession);

  const handleClosedSession = (session: ManagedSession, treatedTasks: Task[]) => {
    createActaFromSession({ tipo: 'Comité', session, treatedTasks });
  };

  return (
    <SessionManagementPage
      config={COMITE_SESSION_CONFIG}
      initialSessionId={initialSessionId}
      navigationNonce={navigationNonce}
      onClosedSession={handleClosedSession}
      useSessionStore={useCommitteeSessionStore}
    />
  );
}
