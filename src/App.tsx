import { useEffect, useState } from 'react';
import { AjustesPage } from './components/AjustesPage';
import { DashboardCards } from './components/DashboardCards';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { ActasPage } from './features/actas/components/ActasPage';
import { ComitePage } from './features/comite/components/ComitePage';
import { CriteriosRrllPage } from './features/criterios-rrll/components/CriteriosRrllPage';
import { EspecialesPage } from './features/especiales/components/EspecialesPage';
import { SorteosPage } from './features/sorteos/components/SorteosPage';
import { PlantillaPage } from './components/PlantillaPage';
import { ParitariaPage } from './features/paritaria/components/ParitariaPage';
import { Sidebar, type AppView } from './components/Sidebar';
import { TareasPage } from './components/TareasPage';
import { TeletrabajoPage } from './components/TeletrabajoPage';
import { TicketRestaurantePage } from './features/ticket-restaurante/components/TicketRestaurantePage';
import { VinculogramaPage } from './features/vinculograma/components/VinculogramaPage';
import {
  startExternalDataSyncPolling,
  stopExternalDataSyncPolling,
} from './services/externalDataSync';
import { bootstrapSqlitePersistence } from './services/persistence';

type NavigationTarget = {
  view: AppView;
  recordId?: string;
  nonce: number;
};

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
          {activeView === 'plantilla' && <PlantillaPage />}
          {activeView === 'tareas' && (
            <TareasPage
              initialTaskId={navigationTarget?.view === 'tareas' ? navigationTarget.recordId : null}
              navigationNonce={
                navigationTarget?.view === 'tareas' ? navigationTarget.nonce : undefined
              }
            />
          )}
          {activeView === 'comite' && <ComitePage />}
          {activeView === 'actas' && <ActasPage />}
          {activeView === 'paritaria' && <ParitariaPage />}
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
          {activeView === 'ticket-restaurante' && <TicketRestaurantePage />}
          {activeView === 'sorteos' && <SorteosPage />}
          {activeView === 'vinculograma' && <VinculogramaPage />}
          {activeView === 'especiales' && <EspecialesPage />}
          {activeView === 'ajustes' && <AjustesPage />}
        </main>
        <Footer />
      </div>
    </div>
  );
}
