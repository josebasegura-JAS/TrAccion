import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import { useAppDialog } from '../../../hooks/useAppDialog';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { COMITE_SESSION_CONFIG } from '../domain/comite';
import { useCommitteeSessionStore } from '../store/useCommitteeSessionStore';
import { PARITARIA_SESSION_CONFIG } from '../../paritaria/domain/paritaria';
import { useParitariaSessionStore } from '../../paritaria/store/useParitariaSessionStore';
import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ComiteParitariaWorkflow } from './ComiteParitariaWorkflow';
import { COMITE_HELP_SECTIONS, PARITARIA_HELP_SECTIONS } from './comiteHelpSections';



export function ComitePage({
  initialSessionId = null,
  navigationNonce,
}: {
  initialSessionId?: string | null;
  navigationNonce?: number;
}) {
  const createActaFromSession = useActasStore((state) => state.createFromSessionWithConcurrencyCheck);
  const { alert, dialogNode } = useAppDialog();
  const [operationalOrgan, setOperationalOrgan] = useState<'comite' | 'paritaria' | null>(
    initialSessionId ? 'comite' : null,
  );
  const [operationalSessionId, setOperationalSessionId] = useState<string | null>(initialSessionId);

  const handleClosedCommitteeSession = async (session: ManagedSession, treatedTasks: Task[]) => {
    const result = await createActaFromSession({ tipo: 'Comité', session, treatedTasks });
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
  };

  const handleClosedParitariaSession = async (session: ManagedSession, treatedTasks: Task[]) => {
    const result = await createActaFromSession({ tipo: 'Paritaria', session, treatedTasks });
    if (!result.ok) {
      await alert(result.message, { type: 'error' });
    }
  };

  const openOrgan = (organ: 'comite' | 'paritaria', sessionId?: string | null) => {
    setOperationalOrgan(organ);
    setOperationalSessionId(sessionId ?? null);
  };

  if (!operationalOrgan) {
    return (
      <>
        <ComiteParitariaWorkflow onOpenOrgan={openOrgan} />
        {dialogNode}
      </>
    );
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-metro-panel/70 px-3 py-2">
        <button
          className="flex items-center gap-2 text-sm font-bold text-metro-secondary transition hover:text-white"
          onClick={() => {
            setOperationalOrgan(null);
            setOperationalSessionId(null);
          }}
          type="button"
        >
          <ArrowLeft size={16} /> Inicio Comité / Paritaria
        </button>
        <span className="text-xs font-semibold text-metro-muted">
          Gestión operativa · {operationalOrgan === 'comite' ? 'Comité' : 'Paritaria'}
        </span>
      </div>

      {operationalOrgan === 'comite' ? (
        <SessionManagementPage
          config={COMITE_SESSION_CONFIG}
          helpSections={COMITE_HELP_SECTIONS}
          initialSessionId={operationalSessionId}
          navigationNonce={navigationNonce}
          onClosedSession={handleClosedCommitteeSession}
          useSessionStore={useCommitteeSessionStore}
        />
      ) : (
        <SessionManagementPage
          config={PARITARIA_SESSION_CONFIG}
          helpSections={PARITARIA_HELP_SECTIONS}
          initialSessionId={operationalSessionId}
          navigationNonce={navigationNonce}
          onClosedSession={handleClosedParitariaSession}
          useSessionStore={useParitariaSessionStore}
        />
      )}
      {dialogNode}
    </>
  );
}
