import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
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


  return (
    <>
      <SessionManagementPage
      config={PARITARIA_SESSION_CONFIG}
      helpSections={PARITARIA_HELP_SECTIONS}
      initialSessionId={initialSessionId}
      navigationNonce={navigationNonce}
      useSessionStore={useParitariaSessionStore}
    />
    </>
  );
}
