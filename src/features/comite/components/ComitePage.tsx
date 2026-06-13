import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { COMITE_SESSION_CONFIG } from '../domain/comite';
import { useCommitteeSessionStore } from '../store/useCommitteeSessionStore';

const COMITE_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona puntos tratados y sesiones del Comité de Empresa, incluyendo apertura, cierre, histórico y generación de acta.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear o importar puntos pendientes.',
      'Crear la sesión correspondiente.',
      'Añadir y ordenar los puntos que se tratarán en la sesión.',
      'Cerrar la sesión indicando puntos tratados y no tratados.',
      'Generar el acta desde la sesión cerrada.',
    ],
  },
  {
    title: 'Reglas principales',
    items: [
      'Los puntos pueden estar pendientes, en curso o cerrados.',
      'Las sesiones abiertas siguen visibles hasta su cierre.',
      'Las sesiones cerradas pasan a histórico.',
      'El cierre de sesión actualiza los puntos tratados según la fase configurada.',
      'Los puntos no tratados pueden mantenerse para una sesión posterior.',
    ],
  },
];

export function ComitePage({
  initialSessionId = null,
  navigationNonce,
}: {
  initialSessionId?: string | null;
  navigationNonce?: number;
}) {
  const createActaFromSession = useActasStore((state) => state.createFromSessionWithConcurrencyCheck);

  const handleClosedSession = async (session: ManagedSession, treatedTasks: Task[]) => {
    const result = await createActaFromSession({ tipo: 'Comité', session, treatedTasks });
    if (!result.ok) {
      window.alert(result.message);
    }
  };

  return (
    <SessionManagementPage
      config={COMITE_SESSION_CONFIG}
      helpSections={COMITE_HELP_SECTIONS}
      initialSessionId={initialSessionId}
      navigationNonce={navigationNonce}
      onClosedSession={handleClosedSession}
      useSessionStore={useCommitteeSessionStore}
    />
  );
}
