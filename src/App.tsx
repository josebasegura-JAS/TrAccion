import { useEffect, useState } from 'react';
import { AjustesPage } from './components/AjustesPage';
import { DashboardCards } from './components/DashboardCards';
import { Header } from './components/Header';
import { ComitePage } from './features/comite/components/ComitePage';
import { CriteriosRrllPage } from './features/criterios-rrll/components/CriteriosRrllPage';
import { EspecialesPage } from './features/especiales/components/EspecialesPage';
import { SorteosPage } from './features/sorteos/components/SorteosPage';
import { PlantillaPage } from './components/PlantillaPage';
import { Sidebar, type AppView } from './components/Sidebar';
import { TareasPage } from './components/TareasPage';
import { TeletrabajoPage } from './components/TeletrabajoPage';
import { TicketRestaurantePage } from './features/ticket-restaurante/components/TicketRestaurantePage';
import { VinculogramaPage } from './features/vinculograma/components/VinculogramaPage';
import { startExternalDataSyncPolling, stopExternalDataSyncPolling } from './services/externalDataSync';
import { bootstrapSqlitePersistence } from './services/persistence';

export function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard');

  useEffect(() => {
    bootstrapSqlitePersistence();
    startExternalDataSyncPolling();

    return () => stopExternalDataSyncPolling();
  }, []);

  return (
    <div className="flex min-h-screen bg-metro-app font-sans text-metro-text">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex min-w-0 flex-1 flex-col bg-metro-app/95">
        <Header activeView={activeView} />
        <main className="min-w-0 flex-1 space-y-5 overflow-auto p-5">
          {activeView === 'dashboard' && <DashboardCards />}
          {activeView === 'plantilla' && <PlantillaPage />}
          {activeView === 'tareas' && <TareasPage />}
          {activeView === 'comite' && <ComitePage />}
          {activeView === 'criterios-rrll' && <CriteriosRrllPage />}
          {activeView === 'teletrabajo' && <TeletrabajoPage />}
          {activeView === 'ticket-restaurante' && <TicketRestaurantePage />}
          {activeView === 'sorteos' && <SorteosPage />}
          {activeView === 'vinculograma' && <VinculogramaPage />}
          {activeView === 'especiales' && <EspecialesPage />}
          {activeView === 'ajustes' && <AjustesPage />}
        </main>
      </div>
    </div>
  );
}
