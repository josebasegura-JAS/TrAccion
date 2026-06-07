import { lazy, Suspense, useEffect, useState } from 'react';
import { DashboardCards } from './components/DashboardCards';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { Sidebar, type AppView } from './components/Sidebar';
import {
  startExternalDataSyncPolling,
  stopExternalDataSyncPolling,
} from './services/externalDataSync';
import { bootstrapSqlitePersistence } from './services/persistence';

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

function ModuleLoading({ activeView }: { activeView: AppView }) {
  return (
    <div className="module-loading" role="status" aria-live="polite">
      <div className="module-loading__spinner" aria-hidden="true" />
      <span>{moduleLoadingLabels[activeView] ?? 'Cargando módulo...'}</span>
    </div>
  );
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard');
  const [navigationTarget, setNavigationTarget] = useState<NavigationTarget | null>(null);

  useEffect(() => {
    bootstrapSqlitePersistence();
    startExternalDataSyncPolling();

    return () => stopExternalDataSyncPolling();
  }, []);

  const handleDashboardOpenRecord = (target: { view: AppView; recordId?: string }) => {
    setNavigationTarget({ ...target, nonce: Date.now() });
    setActiveView(target.view);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-metro-app font-sans text-metro-text">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-metro-app/95">
        <Header activeView={activeView} onViewChange={setActiveView} />
        <main className="min-w-0 flex-1 space-y-5 overflow-auto p-5">
          {activeView === 'dashboard' && (
            <DashboardCards onOpenRecord={handleDashboardOpenRecord} />
          )}
          <Suspense fallback={<ModuleLoading activeView={activeView} />}>
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
        </main>
        <Footer />
      </div>
    </div>
  );
}
