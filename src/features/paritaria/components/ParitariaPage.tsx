import { SessionManagementPage } from '../../../shared/sessions/SessionManagementPage';
import { useAppDialog } from '../../../hooks/useAppDialog';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { Task } from '../../tareas/domain/task';
import { useActasStore } from '../../actas/store/useActasStore';
import { PARITARIA_SESSION_CONFIG } from '../domain/paritaria';
import { useParitariaSessionStore } from '../store/useParitariaSessionStore';

const PARITARIA_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona puntos y sesiones de la Comisión Paritaria, con apertura, cierre, histórico y generación de acta.',
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear o importar puntos pendientes de Paritaria.',
      'Crear la sesión correspondiente.',
      'Añadir y ordenar los puntos que se tratarán.',
      'Cerrar la sesión diferenciando puntos tratados y no tratados.',
      'Generar el acta desde la sesión cerrada.',
    ],
  },
  {
    title: 'Reglas principales',
    items: [
      'Los puntos pueden estar pendientes, en curso o cerrados.',
      'Las sesiones abiertas permanecen visibles hasta su cierre.',
      'Las sesiones cerradas pasan a histórico.',
      'El cierre de sesión actualiza los puntos tratados según la fase configurada.',
      'Los puntos no tratados pueden mantenerse para una sesión posterior.',
    ],
  },
];

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
