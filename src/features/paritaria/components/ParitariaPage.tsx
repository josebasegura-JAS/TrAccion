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
    body: 'Gestiona las sesiones de la Comisión Paritaria: qué puntos se tratan en cada una, su cierre y la generación automática del acta correspondiente.',
  },
  {
    title: 'De dónde salen los puntos',
    items: [
      'Los puntos disponibles para añadir a una sesión son las tareas del módulo Tareas que tienen la fase "paritaria" y todavía no están cerradas.',
      'Una tarea puede estar en varios estados (pendiente, en curso, bloqueada, resuelta); mientras no esté cerrada, sigue disponible para incluirla en una sesión.',
      'Si el punto que necesitas no aparece, revisa en Tareas que tenga la fase correcta.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear la sesión indicando fecha, código y título.',
      'Añadir los puntos (tareas de fase paritaria) que se van a tratar y ordenarlos si hace falta.',
      'Cuando termine la reunión, cerrar la sesión: para cada punto se indica si se ha tratado o no.',
      'Los puntos marcados como tratados cierran automáticamente esa tarea en Tareas; los no tratados quedan disponibles para una sesión posterior.',
      'Al cerrar, se puede generar directamente un registro en Actas con los puntos tratados.',
    ],
  },
  {
    title: 'Sesiones abiertas e histórico',
    items: [
      'Una sesión solo tiene dos estados: abierta o cerrada.',
      'Las sesiones abiertas se pueden seguir editando (añadir, quitar o reordenar puntos).',
      'Al cerrarse, la sesión pasa al histórico y ya no admite cambios en sus puntos.',
    ],
  },
  {
    title: 'Importar sesiones antiguas desde Word',
    items: [
      'Se puede importar un documento Word (u otro texto) con actas antiguas de Paritaria para recuperar sesiones e histórico.',
      'La app detecta las sesiones que correspondan a este módulo dentro del documento y evita duplicar sesiones que coincidan en código y fecha con una ya existente.',
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
