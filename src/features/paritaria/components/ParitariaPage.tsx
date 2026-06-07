import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { PARITARIA_SESSION_CONFIG } from '../domain/paritaria';
import { useParitariaSessionStore } from '../store/useParitariaSessionStore';

export function ParitariaPage() {
  const createActaFromSession = useActasStore((state) => state.createFromSession);

  const handleClosedSession = (session: ManagedSession, treatedTasks: Task[]) => {
    createActaFromSession({ tipo: 'Paritaria', session, treatedTasks });
  };

  return (
    <SessionManagementPage
      config={PARITARIA_SESSION_CONFIG}
      onClosedSession={handleClosedSession}
      useSessionStore={useParitariaSessionStore}
    />
  );
}
