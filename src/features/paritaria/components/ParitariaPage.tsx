import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import { useAppDialog } from '../../../hooks/useAppDialog';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { PARITARIA_SESSION_CONFIG } from '../domain/paritaria';
import { useParitariaSessionStore } from '../store/useParitariaSessionStore';
import { PARITARIA_HELP_SECTIONS } from '../../comite/components/comiteHelpSections';



export function ParitariaPage({
  initialSessionId = null,
  navigationNonce,
}: {
  initialSessionId?: string | null;
  navigationNonce?: number;
}) {
  const createActaFromSession = useActasStore((state) => state.createFromSessionWithConcurrencyCheck);
  const { alert, dialogNode } = useAppDialog();

  const handleClosedSession = async (session: ManagedSession, treatedTasks: Task[]) => {
    const result = await createActaFromSession({ tipo: 'Paritaria', session, treatedTasks });
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
  };

  return (
    <>
      <SessionManagementPage
      config={PARITARIA_SESSION_CONFIG}
      helpSections={PARITARIA_HELP_SECTIONS}
      initialSessionId={initialSessionId}
      navigationNonce={navigationNonce}
      onClosedSession={handleClosedSession}
      useSessionStore={useParitariaSessionStore}
    />
      {dialogNode}
    </>
  );
}
