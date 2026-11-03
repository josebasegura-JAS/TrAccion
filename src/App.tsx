import { ExcelBackupRetryBanner } from './components/ExcelBackupRetryBanner';
import { Component, lazy, Suspense, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, LockKeyhole, RefreshCw, WifiOff } from 'lucide-react';
import { AppUpdateChecker } from './components/AppUpdateChecker';
import { GlobalBusyIndicator } from './components/GlobalBusyIndicator';
import { BackgroundActivityIndicator } from './components/BackgroundActivityIndicator';
import { TooltipLayer } from './components/ui/TooltipLayer';
import { ToastProvider } from './components/ui/Toast';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { resolveActiveViewForNavigation, resolveCommitteeOrganForNavigation, type AppView } from './navigation/navigation';
import { startExternalDataSyncPolling, stopExternalDataSyncPolling } from './services/externalDataSync';
import { getConnectionDiagnostics, subscribeConnectionDiagnostics, requestDatabaseReconnectCheck, startDatabaseHealthMonitor, stopDatabaseHealthMonitor } from './services/databaseHealthMonitor';
import { useDatabaseStatus } from './services/databaseStatus';
import { useEditingAvailability } from './services/editingAvailability';
import { useDatabaseConnectivityState } from './services/databaseConnectivityState';
import { buildConnectionReport, connectionProblemExplanation } from './services/connectionRecoveryHelp';
import { hasDirtyEditors } from './services/dirtyEditors';
import { recordPerformanceMetric } from './services/performanceMetrics';
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
const ActividadesExternasPage = lazy(() => import('./features/actividades-externas/components/ActividadesExternasPage').then((m) => ({ default: m.ActividadesExternasPage })));
const VinculogramaPage = lazy(() => import('./features/vinculograma/components/VinculogramaPage').then((m) => ({ default: m.VinculogramaPage })));
const AyudaEscolarPage = lazy(() => import('./features/ayuda-escolar/components/AyudaEscolarPage').then((m) => ({ default: m.AyudaEscolarPage })));

type NavigationTarget = { view: AppView; recordId?: string; pointId?: string; responsibleFilter?: string; nonce: number };
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
  paritaria: 'Cargando Comisión Paritaria...',
  'criterios-rrll': 'Cargando Criterios...',
  teletrabajo: 'Cargando Teletrabajo...',
  'ticket-restaurante': 'Cargando Ticket Restaurante...',
  presupuestos: 'Cargando Presupuestos...',
  'licencias-sin-sueldo': 'Cargando Licencias...',
  sorteos: 'Cargando Sorteos...',
  loteria: 'Cargando Lotería...',
  vinculograma: 'Cargando Vinculograma...',
  'actividades-externas': 'Cargando Actividades Externas...',
  especiales: 'Cargando Especiales...',
  ajustes: 'Cargando Ajustes...',
};

function PersistenceErrorBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const [feedback, setFeedback] = useState<PersistenceFeedback | null>(null);
  const connectivity = useDatabaseConnectivityState();
  useEffect(() => {
    if (connectivity.phase === 'recovered') setFeedback(null);
  }, [connectivity.phase]);
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
  // Durante la recuperación, un error de lectura previo no debe aparecer
  // erróneamente como un nuevo fallo de guardado.
  if (!feedback || connectivity.phase === 'reconnecting' || connectivity.phase === 'syncing') return null;
  const isLockIssue = isTemporarySqliteLockMessage(feedback.message || '');
  return (
    <section className="persistence-error-banner" role="alert" aria-live="assertive"><AlertTriangle size={20} aria-hidden="true" />
      <div><strong>{/load|list|get|lectura|cargar|consultar/i.test(`${feedback.key ?? ''} ${feedback.message}`) ? 'Error al consultar datos' : 'Error de guardado'}</strong><p>{feedback.message || 'No se han podido guardar los últimos cambios. Revisa la conexión o la persistencia antes de continuar editando.'}</p>
        {isLockIssue && <button className="persistence-error-banner__action" onClick={onGoToAjustes} type="button">Ver bloqueo en Ajustes</button>}
      </div>
    </section>
  );
}

function ConnectionRecoveryBanner() {
  const connectivity = useDatabaseConnectivityState();
  const [diagnostics, setDiagnostics] = useState(getConnectionDiagnostics);
  const [restarting, setRestarting] = useState(false);
  const [restartError, setRestartError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => subscribeConnectionDiagnostics(() => setDiagnostics(getConnectionDiagnostics())), []);
  const staleConnectionMs = diagnostics.lastFailureAt ? Date.now() - new Date(diagnostics.lastFailureAt).getTime() : 0;
  const offerRestart = connectivity.phase === 'reconnecting' && (diagnostics.consecutiveFailures >= 5 || staleConnectionMs >= 30_000);
  if (connectivity.phase === 'connected') return null;

  const recovered = connectivity.phase === 'recovered';
  const syncing = connectivity.phase === 'syncing';
  const waiting = !recovered && !syncing;
  const title = recovered
    ? 'Conexión recuperada: datos actualizados'
    : syncing
      ? 'La base responde: actualizando información'
      : 'Conexión con los datos interrumpida';
  const summary = recovered
    ? 'Puedes continuar trabajando. TrAcción ha comprobado la base compartida y actualizado los datos.'
    : syncing
      ? 'La base de datos vuelve a responder. La edición seguirá bloqueada hasta terminar la actualización.'
      : 'TrAcción ha bloqueado temporalmente los cambios para proteger la información. Está comprobando la base automáticamente.';
  const report = buildConnectionReport({
    phase: connectivity.phase,
    attempt: connectivity.attempt,
    checking: diagnostics.checking,
    consecutiveFailures: diagnostics.consecutiveFailures,
    lastFailureAt: diagnostics.lastFailureAt,
    lastSuccessAt: diagnostics.lastSuccessAt,
    lastCheckDurationMs: diagnostics.lastCheckDurationMs,
    lastError: diagnostics.lastError,
  });

  return (
    <section
      className={`mb-2 rounded-xl border px-3.5 py-3 shadow-sm ${
        recovered ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100' : 'border-amber-400/25 bg-amber-400/10 text-amber-50'
      }`}
      role="status" aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${recovered ? 'bg-emerald-400/15' : 'bg-amber-400/15'}`}>
          {recovered ? <CheckCircle2 size={19} aria-hidden="true" /> : syncing ? <RefreshCw className="animate-spin" size={19} aria-hidden="true" /> : <WifiOff size={19} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <strong className="block text-sm">{title}</strong>
          <p className="mt-0.5 text-xs opacity-90">{summary}</p>
          {waiting && <p className="mt-1 text-xs opacity-80">
            {diagnostics.checking ? 'Comprobando ahora…' : `Reintentos automáticos: ${Math.max(connectivity.attempt, diagnostics.consecutiveFailures)}`}
          </p>}
        </div>
        {waiting && <button type="button" onClick={requestDatabaseReconnectCheck} disabled={diagnostics.checking}
          className="shrink-0 rounded-lg border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold hover:bg-amber-300/15 disabled:opacity-50">
          {diagnostics.checking ? 'Comprobando…' : 'Comprobar ahora'}
        </button>}
        {offerRestart && (
          <button type="button" disabled={restarting || !window.traccion?.requestSafeRestart}
            className="shrink-0 rounded-lg border border-amber-300/25 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            onClick={() => {
              if (!window.traccion?.requestSafeRestart) return;
              setRestarting(true);
              setRestartError('');
              void window.traccion.requestSafeRestart().then((result) => {
                if (!result.ok) setRestartError(result.message ?? 'No se pudo reiniciar TrAcción.');
              }).catch((error: unknown) => setRestartError(error instanceof Error ? error.message : 'Error al solicitar el reinicio.'))
                .finally(() => setRestarting(false));
            }}>
            {restarting ? 'Preparando reinicio…' : 'Reiniciar de forma segura'}
          </button>
        )}
        {!recovered && (
          <button type="button" aria-expanded={showDetails} onClick={() => setShowDetails((current) => !current)}
            className="shrink-0 rounded-lg border border-amber-300/25 px-3 py-1.5 text-xs font-semibold">
            {showDetails ? 'Ocultar ayuda' : 'Qué hacer y diagnóstico'}
          </button>
        )}
      </div>
      {restartError && <p className="mt-2 text-xs" role="alert">{restartError}</p>}
      {showDetails && !recovered && (
        <div className="mt-3 border-t border-amber-300/20 pt-3 text-xs">
          <p className="font-semibold">¿Qué está ocurriendo?</p>
          <p className="mt-1 opacity-90">{connectionProblemExplanation(diagnostics.lastError)}</p>
          <p className="mt-3 font-semibold">Qué puedes hacer</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5 opacity-90">
            <li>Comprueba que el equipo está conectado por cable o Wi-Fi y que puedes abrir la carpeta de red de TrAcción.</li>
            <li>Pulsa «Comprobar ahora». TrAcción seguirá comprobando automáticamente aunque no pulses.</li>
            <li>Si no se recupera, usa «Reiniciar de forma segura» cuando aparezca. Revisa antes cualquier formulario sin guardar.</li>
            <li>Si persiste, copia el diagnóstico y envíalo a soporte. No repitas un guardado fallido sin comprobar si se realizó.</li>
          </ol>
          <div className="mt-3 rounded-lg border border-amber-300/20 bg-black/10 p-3">
            <p className="font-semibold">Datos para soporte</p>
            <p className="mt-1 opacity-80">Fallos consecutivos: {diagnostics.consecutiveFailures} · Última comprobación: {diagnostics.lastCheckDurationMs ?? '—'} ms</p>
            <p className="mt-1 break-words opacity-80">Último error: {diagnostics.lastError ?? 'Todavía no registrado'}</p>
            <p className="mt-1 opacity-80">El informe puede contener rutas de red. Compártelo solo con soporte autorizado.</p>
            <button type="button" className="mt-2 rounded-lg border border-amber-300/30 px-3 py-1.5 font-semibold"
              onClick={() => {
                setCopyError('');
                setCopied(false);
                if (!navigator.clipboard?.writeText) {
                  setCopyError('La copia automática no está disponible. Solicita ayuda a soporte.');
                  return;
                }
                void navigator.clipboard.writeText(report)
                  .then(() => setCopied(true))
                  .catch(() => setCopyError('No se pudo copiar el diagnóstico. Solicita ayuda a soporte.'));
              }}>{copied ? 'Diagnóstico copiado' : 'Copiar diagnóstico'}</button>
            {copyError && <p className="mt-2" role="alert">{copyError}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function SqliteReadOnlyBanner({ onGoToAjustes }: { onGoToAjustes: () => void }) {
  const databaseStatus = useDatabaseStatus();
  const editingAvailability = useEditingAvailability();
  if (editingAvailability.allowed || editingAvailability.connectivityBlocked) return null;
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
  const navigationStartedAtRef = useRef<{ view: AppView; startedAt: number } | null>(null);
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

  useEffect(() => {
    const appWindow = window as Window & {
      __traccionConfirmAppClose?: () => Promise<boolean>;
    };
    appWindow.__traccionConfirmAppClose = async () => {
      if (!hasDirtyEditors()) return true;
      return confirm(
        'Hay cambios sin guardar en uno o varios formularios. Si sale ahora, esos cambios se perderán. ¿Desea cerrar TrAcción?',
        {
          title: 'Cambios sin guardar',
          confirmLabel: 'Salir de TrAcción',
          cancelLabel: 'Seguir editando',
          danger: true,
        },
      );
    };
    return () => {
      delete appWindow.__traccionConfirmAppClose;
    };
  }, [confirm]);

  const changeActiveView = async (view: AppView): Promise<void> => {
    const nextView = resolveActiveViewForNavigation(view);
    if (nextView === activeView) return;
    if (hasDirtyEditors()) {
      const shouldLeave = await confirm('Hay cambios sin guardar en el formulario abierto. Si cambia de módulo ahora, el borrador se conservará para poder recuperarlo. ¿Desea continuar?', { title: 'Cambios sin guardar', confirmLabel: 'Cambiar de módulo', cancelLabel: 'Seguir editando' });
      if (!shouldLeave) return;
    }
    navigationStartedAtRef.current = { view: nextView, startedAt: performance.now() };
    setActiveView(nextView);
  };

  useEffect(() => {
    const pending = navigationStartedAtRef.current;
    if (!pending || pending.view !== activeView) return;
    let cancelled = false;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        recordPerformanceMetric('navegacion', `Cambio de vista: ${activeView}`, performance.now() - pending.startedAt);
        if (navigationStartedAtRef.current === pending) navigationStartedAtRef.current = null;
      });
    });
    return () => { cancelled = true; };
  }, [activeView]);

  const resetToDashboard = (): void => window.location.reload();
  const handleDashboardOpenRecord = (target: { view: AppView; recordId?: string; pointId?: string; responsibleFilter?: string }) => {
    setNavigationTarget({ ...target, nonce: Date.now() });
    void changeActiveView(target.view);
  };

  return (
    <ToastProvider>
    <ExcelBackupRetryBanner />
    <AppShellErrorBoundary>
      <TooltipLayer /><AppUpdateChecker />
      <div className="app-shell">
        <Sidebar activeView={activeView} onDashboardReset={resetToDashboard} onViewChange={(view) => { setNavigationTarget(null); void changeActiveView(view); }} />
        <div className="app-shell__main">
          <Header activeView={activeView} onViewChange={handleDashboardOpenRecord} />
          <main className={`app-shell__content ${activeView === 'dashboard' ? 'app-shell__content--dashboard' : ''}`}>
            <div className={`app-module-stage ${activeView === 'dashboard' ? 'app-module-stage--dashboard' : ''}`}>
              <ConnectionRecoveryBanner />
              <SqliteReadOnlyBanner onGoToAjustes={() => void changeActiveView('ajustes')} />
              <PersistenceErrorBanner onGoToAjustes={() => void changeActiveView('ajustes')} />
              <GlobalBusyIndicator />
              <BackgroundActivityIndicator />
              <ModuleErrorBoundary activeView={activeView}>
                <OperationalModuleGuard activeView={activeView}>
                  <Suspense fallback={<ModuleLoading activeView={activeView} />}>
                    {activeView === 'dashboard' && <DashboardCards onOpenRecord={handleDashboardOpenRecord} />}
                    {activeView === 'plantilla' && <PlantillaPage />}
                    {activeView === 'ayuda-escolar' && <AyudaEscolarPage />}
                    {activeView === 'tareas' && <TareasPage initialTaskId={navigationTarget?.view === 'tareas' ? navigationTarget.recordId : null} initialResponsibleFilter={navigationTarget?.view === 'tareas' ? navigationTarget.responsibleFilter : undefined} navigationNonce={navigationTarget?.view === 'tareas' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'coordinacion' && <CoordinacionPage initialMeetingId={navigationTarget?.view === 'coordinacion' ? navigationTarget.recordId : null} initialPointId={navigationTarget?.view === 'coordinacion' ? navigationTarget.pointId : undefined} navigationNonce={navigationTarget?.view === 'coordinacion' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'comite' && <ComitePage initialOrgan={navigationTarget ? resolveCommitteeOrganForNavigation(navigationTarget.view) : null} initialSessionId={navigationTarget && resolveCommitteeOrganForNavigation(navigationTarget.view) ? navigationTarget.recordId : null} navigationNonce={navigationTarget && resolveCommitteeOrganForNavigation(navigationTarget.view) ? navigationTarget.nonce : undefined} />}
                    {activeView === 'actas' && <ActasPage />}
                    {activeView === 'criterios-rrll' && <CriteriosRrllPage />}
                    {activeView === 'teletrabajo' && <TeletrabajoPage initialSolicitudId={navigationTarget?.view === 'teletrabajo' ? navigationTarget.recordId : null} navigationNonce={navigationTarget?.view === 'teletrabajo' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'ticket-restaurante' && <TicketRestaurantePage initialAbsenceId={navigationTarget?.view === 'ticket-restaurante' ? navigationTarget.recordId : null} navigationNonce={navigationTarget?.view === 'ticket-restaurante' ? navigationTarget.nonce : undefined} />}
                    {activeView === 'licencias-sin-sueldo' && <LicenciasSinSueldoPage />}
                    {activeView === 'presupuestos' && <PresupuestosPage />}
                    {activeView === 'sorteos' && <SorteosPage />}
                    {activeView === 'loteria' && <LoteriaPage />}
                    {activeView === 'vinculograma' && <VinculogramaPage />}
                    {activeView === 'actividades-externas' && <ActividadesExternasPage />}
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
    </ToastProvider>
  );
}
