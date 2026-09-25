import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, LockKeyhole } from 'lucide-react';
import { AppUpdateChecker } from './components/AppUpdateChecker';
import { GlobalBusyIndicator } from './components/GlobalBusyIndicator';
import { TooltipLayer } from './components/ui/TooltipLayer';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { resolveActiveViewForNavigation, resolveCommitteeOrganForNavigation, type AppView } from './navigation/navigation';
import { startExternalDataSyncPolling, stopExternalDataSyncPolling } from './services/externalDataSync';
import { startDatabaseHealthMonitor, stopDatabaseHealthMonitor } from './services/databaseHealthMonitor';
import { useDatabaseStatus } from './services/databaseStatus';
import { useEditingAvailability } from './services/editingAvailability';
import { hasDirtyEditors } from './services/dirtyEditors';
import { useAppDialog } from './hooks/useAppDialog';
import {
  bootstrapSqlitePersistence,
  isTemporarySqliteLockMessage,
  startDatabaseConnectivityIssueListener,
  stopDatabaseConnectivityIssueListener,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from './services/persistence';

const DashboardCards = lazy(() => import('./components/DashboardCards').then((m) => ({ default: m.DashboardCards })));
const AjustesPage = lazy(() => import('./components/AjustesPage').then((m) => ({ default: m.AjustesPage })));
const ActasPage = lazy(() => import('./features/actas/components/ActasPage').then((m) => ({ default: m.ActasPage })));
const HuelgasPage = lazy(() => import('./features/huelgas/components/HuelgasPage').then((m) => ({ default: m.HuelgasPage })));
const ComitePage = lazy(() => import('./features/comite/components/ComitePage').then((m) => ({ default: m.ComitePage })));
const CriteriosRrllPage = lazy(() => import('./features/criterios-rrll/components/CriteriosRrllPage').then((m) => ({ default: m.CriteriosRrllPage })));
const EspecialesPage = lazy(() => import('./features/especiales/components/EspecialesPage').then((m) => ({ default: m.EspecialesPage })));
const LicenciasSinSueldoPage = lazy(() => import('./features/licencias-sin-sueldo/components/LicenciasSinSueldoPage').then((m) => ({ default: m.LicenciasSinSueldoPage })));
const SorteosPage = lazy(() => import('./features/sorteos/components/SorteosPage').then((m) => ({ default: m.SorteosPage })));
const LoteriaPage = lazy(() => import('./features/loteria/components/LoteriaPage').then((m) => ({ default: m.LoteriaPage })));
const PresupuestosPage = lazy(() => import('./features/presupuestos/components/PresupuestosPage').then((m) => ({ default: m.PresupuestosPage })));
const PlantillaPage = lazy(() => import('./components/PlantillaPage').then((m) => ({ default: m.PlantillaPage })));
const TareasPage = lazy(() => import('./components/TareasPage').then((m) => ({ default: m.TareasPage })));
const CoordinacionPage = lazy(() => import('./features/coordinacion/components/CoordinacionPage').then((m) => ({ default: m.CoordinacionPage })));
const TeletrabajoPage = lazy(() => import('./components/TeletrabajoPage').then((m) => ({ default: m.TeletrabajoPage })));
const TicketRestaurantePage = lazy(() => import('./features/ticket-restaurante/components/TicketRestaurantePage').then((m) => ({ default: m.TicketRestaurantePage })));
const VinculogramaPage = lazy(() => import('./features/vinculograma/components/VinculogramaPage').then((m) => ({ default: m.VinculogramaPage })));
const AyudaEscolarPage = lazy(() => import('./features/ayuda-escolar/components/AyudaEscolarPage').then((m) => ({ default: m.AyudaEscolarPage })));

type NavigationTarget = { view: AppView; recordId?: string; responsibleFilter?: string; nonce: number };
interface ModuleErrorBoundaryProps { activeView: AppView; children: ReactNode; }
interface ModuleErrorBoundaryState { error: Error | null; }

class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void { console.error('Error renderizando el módulo activo.', error, errorInfo); }
  componentDidUpdate(previousProps: ModuleErrorBoundaryProps): void {
    if (previousProps.activeView !== this.props.activeView && this.state.error) this.setState({ error: null });
  }
  handleReload = (): void => window.location.reload();
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="rounded-2xl border border-red-500/50 bg-red-950/30 p-5 text-red-100" role="alert">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
          <div className="space-y-2"><h2 className="text-base font-semibold">No se ha podido cargar este módulo</h2>
            <p className="text-sm text-red-100/85">La aplicación ha evitado quedarse en pantalla negra. Revisa la consola o el log de Electron para ver el error exacto.</p>
            <p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-red-50/80">{this.state.error.message}</p>
            <button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700" onClick={this.handleReload} type="button">Recargar aplicación</button>
          </div></div>
      </section>
    );
  }
}

const moduleLoadingLabels: Partial<Record<AppView, string>> = {
  plantilla: 'Cargando Plantilla...',
  'ayuda-escolar': 'Cargando Ayuda escolar...',
  tareas: 'Cargando Tareas...',
  coordinacion: 'Cargando Coordinación...',
  comite: 'Cargando Comité de Empresa...',
  actas: 'Cargando Actas...',
  huelgas: 'Cargando Huelgas...',
  paritaria: 'Cargando Comisión Paritaria...',
  'criterios-rrll': 'Cargando Criterios...',
  teletrabajo: 'Cargando Teletrabajo...',
  'ticket-restaurante': 'Cargando Ticket Restaurante...',
  presupuestos: 'Cargando Presupuestos...',
  'licencias-sin-sueldo': 'Cargando Licencias...',
  sorteos: 'Cargando Sorteos...',
  loteria: 'Cargando Lotería...',
  vinculograma: 'Cargando Vinculograma...',
  especiales: 'Cargando Especiales...',
  ajustes: 'Cargando Ajustes...',
};

function PersistenceErrorBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const [feedback, setFeedback] = useState<PersistenceFeedback | null>(null);
  useEffect(() => subscribeToPersistenceFeedback((nextFeedback) => {
    if (nextFeedback.kind === 'error') setFeedback(nextFeedback);
    else if (nextFeedback.kind === 'saved') {
      setFeedback((current) => {
        if (!current) return null;
        const sameKey = !current.key || !nextFeedback.key || current.key === nextFeedback.key;
        return sameKey ? null : current;
      });
    }
  }), []);
  if (!feedback) return null;
  const isLockIssue = isTemporarySqliteLockMessage(feedback.message || '');
  return (
    <section className="persistence-error-banner" role="alert" aria-live="assertive"><AlertTriangle size={20} aria-hidden="true" />
      <div><strong>Error de guardado</strong><p>{feedback.message || 'No se han podido guardar los últimos cambios. Revisa la conexión o la persistencia antes de continuar editando.'}</p>
        {isLockIssue && <button className="persistence-error-banner__action" onClick={onGoToAjustes} type="button">Ver bloqueo en Ajustes</button>}
      </div>
    </section>
  );
}

function SqliteReadOnlyBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const databaseStatus = useDatabaseStatus();
  const editingAvailability = useEditingAvailability();
  if (editingAvailability.allowed) return null;
  const detail = editingAvailability.reason || databaseStatus?.message || (databaseStatus ? 'SQLite no está activa.' : 'Comprobando la conexión con SQLite.');
  return (
    <section className="sqlite-readonly-banner" role="alert" aria-live="assertive"><LockKeyhole size={20} aria-hidden="true" />
      <div className="min-w-0 flex-1"><strong>Base compartida no disponible: edición bloqueada</strong><p>{detail} TrAcción no permite trabajar en local. No se guardará ninguna modificación hasta confirmar la conexión con la base compartida.</p></div>
      <button className="sqlite-readonly-banner__action" onClick={onGoToAjustes} type="button">Revisar en Ajustes</button>
    </section>
  );
}

function OperationalModuleGuard({ activeView, children }: { activeView: AppView; children: ReactNode }) {
  const editingAvailability = useEditingAvailability();
  const contentRef = useRef<HTMLDivElement>(null);
  const guardInteraction = !editingAvailability.allowed && activeView !== 'ajustes';
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    if (guardInteraction) element.setAttribute('inert', ''); else element.removeAttribute('inert');
  }, [guardInteraction]);
  return <div ref={contentRef} aria-disabled={guardInteraction || undefined} className={guardInteraction ? 'sqlite-readonly-content' : undefined}>{children}</div>;
}

function ModuleLoading({ activeView }: { activeView: AppView }) {
  const title = moduleLoadingLabels[activeView] ?? 'Cargando módulo...';
  return (
    <section className="module-loading-skeleton" role="status" aria-live="polite" aria-label={title}>
      <div className="module-loading-skeleton__header"><div className="module-loading-skeleton__title" /><div className="module-loading-skeleton__actions"><span /><span /></div></div>
      <div className="module-loading-skeleton__filters"><span /><span /><span /></div>
      <div className="module-loading-skeleton__table" aria-hidden="true"><div className="module-loading-skeleton__table-head"><span /><span /><span /><span /></div>
        {Array.from({ length: 5 }).map((_, index) => <div className="module-loading-skeleton__table-row" key={index}><span /><span /><span /><span /></div>)}
      </div><span className="sr-only">{title}</span>
    </section>
  );
}

class AppShellErrorBoundary extends Component<{ children: ReactNode }, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState { return { error }; }
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void { console.error('Error renderizando la aplicación.', error, errorInfo); }
  handleReset = (): void => window.location.reload();
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-metro-app p-6 text-metro-text"><section className="max-w-2xl rounded-2xl border border-red-500/50 bg-red-950/30 p-6 text-red-100 shadow-xl" role="alert">
        <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 shrink-0" size={24} aria-hidden="true" /><div className="space-y-3"><div><h1 className="text-lg font-semibold">No se ha podido mostrar TrAcción</h1><p className="mt-1 text-sm text-red-100/85">Se ha capturado un error de render para evitar la pantalla gris. Reinicia al inicio y revisa el log si persiste.</p></div><p className="rounded-lg bg-black/20 px-3 py-2 text-xs text-red-50/80">{this.state.error.message}</p><button className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700" onClick={this.handleReset} type="button">Reiniciar al inicio</button></div></div>
      </section></div>
    );
  }
}

export function App() {
  const { confirm, dialogNode } = useAppDialog();
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);

  useEffect(() => {
    bootstrapSqlitePersistence();
    startDatabaseConnectivityIssueListener();
    const syncTimer = window.setTimeout(() => startExternalDataSyncPolling(), 1_500);
    const healthTimer = window.setTimeout(() => startDatabaseHealthMonitor(), 2_500);
    return () => {
      window.clearTimeout(syncTimer);
      window.clearTimeout(healthTimer);
      stopDatabaseHealthMonitor();
      stopExternalDataSyncPolling();
      stopDatabaseConnectivityIssueListener();
    };
  }, []);

  const changeActiveView = async (view: AppView): Promise<void> => {
    const nextView = resolveActiveViewForNavigation(view);
    if (nextView === activeView) return;
    if (hasDirtyEditors()) {
      const shouldLeave = await confirm('Hay cambios sin guardar en el formulario abierto. Si cambia de módulo ahora, el borrador se conservará para poder recuperarlo. ¿Desea continuar?', { title: 'Cambios sin guardar', confirmLabel: 'Cambiar de módulo', cancelLabel: 'Seguir editando' });
      if (!shouldLeave) return;
    }
    setActiveView(nextView);
  };

  const resetToDashboard = (): void => window.location.reload();
  const handleDashboardOpenRecord = (target: { view: AppView; recordId?: string; responsibleFilter?: string }) => {
    setNavigationTarget({ ...target, nonce: Date.now() });
    void changeActiveView(target.view);
  };

  return (
    <AppShellErrorBoundary>
      <TooltipLayer /><AppUpdateChecker />
      <div className="app-shell">
        <Sidebar activeView={activeView} onDashboardReset={resetToDashboard} onViewChange={(view) => { setNavigationTarget(null); void changeActiveView(view); }} />
        <div className="app-shell__main">
          <Header activeView={activeView} onViewChange={handleDashboardOpenRecord} />
          <main className={`app-shell__content ${activeView === 'dashboard' ? 'app-shell__content--dashboard' : ''}`}>
            <div className={`app-module-stage ${activeView === 'dashboard' ? 'app-module-stage--dashboard' : ''}`}>
              <SqliteReadOnlyBanner onGoToAjustes={() => void changeActiveView('ajustes')} />
              <PersistenceErrorBanner onGoToAjustes={() => void changeActiveView('ajustes')} />
              <GlobalBusyIndicator />
              <ModuleErrorBoundary activeView={activeView}>
                <OperationalModuleGuard activeView={activeView}>
                  <Suspense fallback={<ModuleLoading activeView={activeView} />}>
                    {activeView === 'dashboard' && <DashboardCards onOpenRecord={handleDashboardOpenRecord} />}
                    {activeView === 'plantilla' && <PlantillaPage />}
                    {activeView === 'ayuda-escolar' && <AyudaEscolarPage />}
                    {activeView === 'tareas' && <TareasPage initialTaskId={navigationTarget?.view === 'tareas' ? navigationTarget.recordId : null} initialResponsibleFilter={navigationTarget?.view === 'tareas' ? navigationTarget.responsibleFilter : undefined} navigationNonce={navigationTarget?.view === 'tareas' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'coordinacion' && <CoordinacionPage initialMeetingId={navigationTarget?.view === 'coordinacion' ? navigationTarget.recordId : null} navigationNonce={navigationTarget?.view === 'coordinacion' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'comite' && <ComitePage initialOrgan={navigationTarget ? resolveCommitteeOrganForNavigation(navigationTarget.view) : null} initialSessionId={navigationTarget && resolveCommitteeOrganForNavigation(navigationTarget.view) ? navigationTarget.recordId : null} navigationNonce={navigationTarget && resolveCommitteeOrganForNavigation(navigationTarget.view) ? navigationTarget.nonce : undefined} />}
                    {activeView === 'actas' && <ActasPage />}
                    {activeView === 'huelgas' && <HuelgasPage />}
                    {activeView === 'criterios-rrll' && <CriteriosRrllPage />}
                    {activeView === 'teletrabajo' && <TeletrabajoPage initialSolicitudId={navigationTarget?.view === 'teletrabajo' ? navigationTarget.recordId : null} navigationNonce={navigationTarget?.view === 'teletrabajo' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'ticket-restaurante' && <TicketRestaurantePage initialAbsenceId={navigationTarget?.view === 'ticket-restaurante' ? navigationTarget.recordId : null} navigationNonce={navigationTarget?.view === 'ticket-restaurante' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'licencias-sin-sueldo' && <LicenciasSinSueldoPage />}
                    {activeView === 'presupuestos' && <PresupuestosPage />}
                    {activeView === 'sorteos' && <SorteosPage />}
                    {activeView === 'loteria' && <LoteriaPage />}
                    {activeView === 'vinculograma' && <VinculogramaPage />}
                    {activeView === 'especiales' && <EspecialesPage />}
                    {activeView === 'ajustes' && <AjustesPage />}
                  </Suspense>
                </OperationalModuleGuard>
              </ModuleErrorBoundary>
            </div>
          </main>
        </div>
      </div>
      {dialogNode}
    </AppShellErrorBoundary>
  );
}
