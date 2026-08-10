import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AppUpdateChecker } from './components/AppUpdateChecker';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { GlobalBusyIndicator } from './components/GlobalBusyIndicator';
import { TooltipLayer } from './components/ui/TooltipLayer';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Sidebar } from './components/Sidebar';
import type { AppView } from './navigation/navigation';
import {
  startExternalDataSyncPolling,
  stopExternalDataSyncPolling,
} from './services/externalDataSync';
import { useDatabaseStatus } from './services/databaseStatus';
import { useEditingAvailability } from './services/editingAvailability';
import {
  bootstrapSqlitePersistence,
  isTemporarySqliteLockMessage,
  startDatabaseConnectivityIssueListener,
  stopDatabaseConnectivityIssueListener,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from './services/persistence';

const DashboardCards = lazy(() =>
  import('./components/DashboardCards').then((module) => ({ default: module.DashboardCards })),
);
const AjustesPage = lazy(() =>
  import('./components/AjustesPage').then((module) => ({ default: module.AjustesPage })),
);
const ActasPage = lazy(() =>
  import('./features/actas/components/ActasPage').then((module) => ({ default: module.ActasPage })),
);
const ComitePage = lazy(() =>
  import('./features/comite/components/ComitePage').then((module) => ({ default: module.ComitePage })),
);
const CriteriosRrllPage = lazy(() =>
  import('./features/criterios-rrll/components/CriteriosRrllPage').then((module) => ({
    default: module.CriteriosRrllPage,
  })),
);
const EspecialesPage = lazy(() =>
  import('./features/especiales/components/EspecialesPage').then((module) => ({
    default: module.EspecialesPage,
  })),
);
const LicenciasSinSueldoPage = lazy(() =>
  import('./features/licencias-sin-sueldo/components/LicenciasSinSueldoPage').then((module) => ({
    default: module.LicenciasSinSueldoPage,
  })),
);
const SorteosPage = lazy(() =>
  import('./features/sorteos/components/SorteosPage').then((module) => ({ default: module.SorteosPage })),
);
const PresupuestosPage = lazy(() =>
  import('./features/presupuestos/components/PresupuestosPage').then((module) => ({
    default: module.PresupuestosPage,
  })),
);
const PlantillaPage = lazy(() =>
  import('./components/PlantillaPage').then((module) => ({ default: module.PlantillaPage })),
);
const ParitariaPage = lazy(() =>
  import('./features/paritaria/components/ParitariaPage').then((module) => ({
    default: module.ParitariaPage,
  })),
);
const TareasPage = lazy(() =>
  import('./components/TareasPage').then((module) => ({ default: module.TareasPage })),
);
const TeletrabajoPage = lazy(() =>
  import('./components/TeletrabajoPage').then((module) => ({ default: module.TeletrabajoPage })),
);
const TicketRestaurantePage = lazy(() =>
  import('./features/ticket-restaurante/components/TicketRestaurantePage').then((module) => ({
    default: module.TicketRestaurantePage,
  })),
);
const VinculogramaPage = lazy(() =>
  import('./features/vinculograma/components/VinculogramaPage').then((module) => ({
    default: module.VinculogramaPage,
  })),
);

type NavigationTarget = {
  view: AppView;
  recordId?: string;
  nonce: number;
};

interface ModuleErrorBoundaryProps {
  activeView: AppView;
  children: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
}

class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error renderizando el módulo activo.', error, errorInfo);
  }

  componentDidUpdate(previousProps: ModuleErrorBoundaryProps): void {
    if (previousProps.activeView !== this.props.activeView && this.state.error) {
      this.setState({ error: null });
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className="rounded-2xl border border-red-500/50 bg-red-950/30 p-5 text-red-100" role="alert">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
          <div className="space-y-2">
            <h2 className="text-base font-semibold">No se ha podido cargar este módulo</h2>
            <p className="text-sm text-red-100/85">
              La aplicación ha evitado quedarse en pantalla negra. Revisa la consola o el log de Electron para ver el error exacto.
            </p>
            <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-red-50/80">
              {this.state.error.message}
            </p>
            <button
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              onClick={this.handleReload}
              type="button"
            >
              Recargar aplicación
            </button>
          </div>
        </div>
      </section>
    );
  }
}

const ACTIVE_VIEW_STORAGE_KEY = 'traccion.v1.ui.activeView';

function readInitialActiveView(): AppView {
  return 'dashboard';
}

function writeActiveView(view: AppView): void {
  try {
    window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
  } catch {
    // La navegación no debe bloquear el render si localStorage no está disponible.
  }
}

const moduleLoadingLabels: Partial<Record<AppView, string>> = {
  plantilla: 'Cargando Plantilla...',
  tareas: 'Cargando Tareas...',
  comite: 'Cargando Comité de Empresa...',
  actas: 'Cargando Actas...',
  paritaria: 'Cargando Comisión Paritaria...',
  'criterios-rrll': 'Cargando Criterios...',
  teletrabajo: 'Cargando Teletrabajo...',
  'ticket-restaurante': 'Cargando Ticket Restaurante...',
  presupuestos: 'Cargando Presupuestos...',
  'licencias-sin-sueldo': 'Cargando Licencias...',
  sorteos: 'Cargando Sorteos...',
  vinculograma: 'Cargando Vinculograma...',
  especiales: 'Cargando Especiales...',
  ajustes: 'Cargando Ajustes...',
};

function PersistenceErrorBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const [feedback, setFeedback] = useState<PersistenceFeedback | null>(null);

  useEffect(() => {
    return subscribeToPersistenceFeedback((nextFeedback) => {
      if (nextFeedback.kind === 'error') {
        // Mostrar el error y recordar la clave afectada.
        setFeedback(nextFeedback);
      } else if (nextFeedback.kind === 'saved') {
        // Limpiar solo si el guardado exitoso corresponde a la misma clave que falló,
        // o si no hay clave concreta (error global). Un guardado de otra clave no
        // indica que el problema anterior se haya resuelto.
        setFeedback((current) => {
          if (!current) return null;
          const sameKey = !current.key || !nextFeedback.key || current.key === nextFeedback.key;
          return sameKey ? null : current;
        });
      }
      // 'saving' no toca el banner — el error permanece visible mientras se reintenta.
    });
  }, []);

  if (!feedback) {
    return null;
  }

  const isLockIssue = isTemporarySqliteLockMessage(feedback.message || '');

  return (
    <section className="persistence-error-banner" role="alert" aria-live="assertive">
      <AlertTriangle size={20} aria-hidden="true" />
      <div>
        <strong>Error de guardado</strong>
        <p>
          {feedback.message ||
            'No se han podido guardar los últimos cambios. Revisa la conexión o la persistencia antes de continuar editando.'}
        </p>
        {isLockIssue && (
          <button
            className="persistence-error-banner__action"
            onClick={onGoToAjustes}
            type="button"
          >
            Ver bloqueo en Ajustes
          </button>
        )}
      </div>
    </section>
  );
}


function SqliteReadOnlyBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const databaseStatus = useDatabaseStatus();
  const editingAvailability = useEditingAvailability();
  const editingAllowed = editingAvailability.allowed;

  if (editingAllowed) {
    return null;
  }

  const detail = editingAvailability.reason
    || databaseStatus?.message
    || (databaseStatus ? 'SQLite no está activa.' : 'Comprobando la conexión con SQLite.');

  return (
    <section className="sqlite-readonly-banner" role="alert" aria-live="assertive">
      <LockKeyhole size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <strong>Modo consulta: edición bloqueada</strong>
        <p>{detail} No se permitirá ninguna modificación hasta confirmar la conexión con la base compartida.</p>
      </div>
      <button className="sqlite-readonly-banner__action" onClick={onGoToAjustes} type="button">
        Revisar en Ajustes
      </button>
    </section>
  );
}

function OperationalModuleGuard({ activeView, children }: { activeView: AppView; children: ReactNode }) {
  const editingAvailability = useEditingAvailability();
  const contentRef = useRef<HTMLDivElement>(null);
  const editingAllowed = editingAvailability.allowed;
  const guardInteraction = !editingAllowed && activeView !== 'dashboard' && activeView !== 'ajustes';

  useEffect(() => {
    const element = contentRef.current;
    if (!element) {
      return;
    }

    if (guardInteraction) {
      element.setAttribute('inert', '');
    } else {
      element.removeAttribute('inert');
    }
  }, [guardInteraction]);

  return (
    <div
      ref={contentRef}
      aria-disabled={guardInteraction || undefined}
      className={guardInteraction ? 'sqlite-readonly-content' : undefined}
    >
      {children}
    </div>
  );
}

function ModuleLoading({ activeView }: { activeView: AppView }) {
  const title = moduleLoadingLabels[activeView] ?? 'Cargando módulo...';

  return (
    <section className="module-loading-skeleton" role="status" aria-live="polite" aria-label={title}>
      <div className="module-loading-skeleton__header">
        <div className="module-loading-skeleton__title" />
        <div className="module-loading-skeleton__actions">
          <span />
          <span />
        </div>
      </div>
      <div className="module-loading-skeleton__filters">
        <span />
        <span />
        <span />
      </div>
      <div className="module-loading-skeleton__table" aria-hidden="true">
        <div className="module-loading-skeleton__table-head">
          <span />
          <span />
          <span />
          <span />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="module-loading-skeleton__table-row" key={index}>
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
      <span className="sr-only">{title}</span>
    </section>
  );
}


class AppShellErrorBoundary extends Component<{ children: ReactNode }, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Error renderizando la aplicación.', error, errorInfo);
  }

  handleReset = (): void => {
    try {
      window.localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
    } catch {
      // No bloquear recuperación si localStorage falla.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-metro-app p-6 text-metro-text">
        <section className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-950/30 p-6 text-red-100 shadow-xl" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0" size={24} aria-hidden="true" />
            <div className="space-y-3">
              <div>
                <h1 className="text-lg font-semibold">No se ha podido mostrar TrAccion</h1>
                <p className="mt-1 text-sm text-red-100/85">
                  Se ha capturado un error de render para evitar la pantalla gris. Reinicia al inicio y revisa el log si persiste.
                </p>
              </div>
              <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-red-50/80">
                {this.state.error.message}
              </p>
              <button
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                onClick={this.handleReset}
                type="button"
              >
                Reiniciar al inicio
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(() => readInitialActiveView());
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);

  useEffect(() => {
    bootstrapSqlitePersistence();
    startDatabaseConnectivityIssueListener();

    const syncTimer = window.setTimeout(() => {
      startExternalDataSyncPolling();
    }, 1_500);

    return () => {
      window.clearTimeout(syncTimer);
      stopExternalDataSyncPolling();
      stopDatabaseConnectivityIssueListener();
    };
  }, []);

  const changeActiveView = (view: AppView): void => {
    writeActiveView(view);
    setActiveView(view);
  };

  const resetToDashboard = (): void => {
    try {
      window.localStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
    } catch {
      // No bloquear el reinicio si localStorage no está disponible.
    }

    window.location.reload();
  };

  const handleDashboardOpenRecord = (target: { view: AppView; recordId?: string }) => {
    setNavigationTarget({ ...target, nonce: Date.now() });
    changeActiveView(target.view);
  };

  return (
    <AppShellErrorBoundary>
      <TooltipLayer />
      <AppUpdateChecker />
      <div className="flex h-screen overflow-hidden bg-metro-app font-sans text-metro-text">
      <Sidebar
        activeView={activeView}
        onDashboardReset={resetToDashboard}
        onViewChange={(view) => {
          setNavigationTarget(null);
          changeActiveView(view);
        }}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-metro-app/95">
        <Header activeView={activeView} onViewChange={handleDashboardOpenRecord} />
        <main
          className={
            activeView === 'dashboard'
              ? 'min-h-0 min-w-0 flex-1 overflow-hidden p-3'
              : 'min-w-0 flex-1 space-y-5 overflow-auto p-5'
          }
        >
          <SqliteReadOnlyBanner onGoToAjustes={() => changeActiveView('ajustes')} />
          <PersistenceErrorBanner onGoToAjustes={() => changeActiveView('ajustes')} />
          <GlobalBusyIndicator />
          <ModuleErrorBoundary activeView={activeView}>
            <OperationalModuleGuard activeView={activeView}>
            <Suspense fallback={<ModuleLoading activeView={activeView} />}>
              {activeView === 'dashboard' && (
                <DashboardCards onOpenRecord={handleDashboardOpenRecord} />
              )}
              {activeView === 'plantilla' && <PlantillaPage />}
            {activeView === 'tareas' && (
              <TareasPage
                initialTaskId={navigationTarget?.view === 'tareas' ? navigationTarget.recordId : null}
                navigationNonce={
                  navigationTarget?.view === 'tareas' ? navigationTarget.nonce : undefined
                }
              />
            )}
            {activeView === 'comite' && (
              <ComitePage
                initialSessionId={navigationTarget?.view === 'comite' ? navigationTarget.recordId : null}
                navigationNonce={
                  navigationTarget?.view === 'comite' ? navigationTarget.nonce : undefined
                }
              />
            )}
            {activeView === 'actas' && <ActasPage />}
            {activeView === 'paritaria' && (
              <ParitariaPage
                initialSessionId={navigationTarget?.view === 'paritaria' ? navigationTarget.recordId : null}
                navigationNonce={
                  navigationTarget?.view === 'paritaria' ? navigationTarget.nonce : undefined
                }
              />
            )}
            {activeView === 'criterios-rrll' && <CriteriosRrllPage />}
            {activeView === 'teletrabajo' && (
              <TeletrabajoPage
                initialSolicitudId={
                  navigationTarget?.view === 'teletrabajo' ? navigationTarget.recordId : null
                }
                navigationNonce={
                  navigationTarget?.view === 'teletrabajo' ? navigationTarget.nonce : undefined
                }
              />
            )}
            {activeView === 'ticket-restaurante' && (
              <TicketRestaurantePage
                initialAbsenceId={
                  navigationTarget?.view === 'ticket-restaurante' ? navigationTarget.recordId : null
                }
                navigationNonce={
                  navigationTarget?.view === 'ticket-restaurante'
                    ? navigationTarget.nonce
                    : undefined
                }
              />
            )}
            {activeView === 'licencias-sin-sueldo' && <LicenciasSinSueldoPage />}
            {activeView === 'presupuestos' && <PresupuestosPage />}
            {activeView === 'sorteos' && <SorteosPage />}
            {activeView === 'vinculograma' && <VinculogramaPage />}
            {activeView === 'especiales' && <EspecialesPage />}
            {activeView === 'ajustes' && <AjustesPage />}
            </Suspense>
            </OperationalModuleGuard>
          </ModuleErrorBoundary>
        </main>
        <Footer />
      </div>
      </div>
    </AppShellErrorBoundary>
  );
}
