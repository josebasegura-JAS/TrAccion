import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
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
  const [operationalOrgan, setOperationalOrgan] = useState<'comite' | 'paritaria' | null>(
    initialSessionId ? 'comite' : null,
  );
  const [operationalSessionId, setOperationalSessionId] = useState<string | null>(initialSessionId);


  const openOrgan = (organ: 'comite' | 'paritaria', sessionId?: string | null) => {
    setOperationalOrgan(organ);
    setOperationalSessionId(sessionId ?? null);
  };

  if (!operationalOrgan) {
    return (
      <>
        <ComiteParitariaWorkflow onOpenOrgan={openOrgan} />
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
          useSessionStore={useCommitteeSessionStore}
        />
      ) : (
        <SessionManagementPage
          config={PARITARIA_SESSION_CONFIG}
          helpSections={PARITARIA_HELP_SECTIONS}
          initialSessionId={operationalSessionId}
          navigationNonce={navigationNonce}
          useSessionStore={useParitariaSessionStore}
        />
      )}
    </>
  );
}
