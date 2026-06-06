import { useState } from 'react';
import { AjustesPage } from './components/AjustesPage';
import { DashboardCards } from './components/DashboardCards';
import { Header } from './components/Header';
import { EspecialesPage } from './features/especiales/components/EspecialesPage';
import { PeticionesPage } from './components/PeticionesPage';
import { PlantillaPage } from './components/PlantillaPage';
import { Sidebar, type AppView } from './components/Sidebar';
import { TareasPage } from './components/TareasPage';
import { TeletrabajoPage } from './components/TeletrabajoPage';
import { TicketRestaurantePage } from './features/ticket-restaurante/components/TicketRestaurantePage';
import { VinculogramaPage } from './features/vinculograma/components/VinculogramaPage';

export function App() {
  const [activeView, setActiveView] = useState<AppView>('dashboard');

  return (
    <div className="flex min-h-screen bg-metro-app font-sans text-metro-text">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-w-0 space-y-5 p-5">
          {activeView === 'dashboard' && (
            <>
              <section className="rounded-3xl border border-metro-border bg-white p-5 shadow-card">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">
                      RRLL
                    </p>
                    <h2 className="mt-1 text-2xl font-bold text-metro-text">
                      Panel RRLL preparado para crecer
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-metro-muted">
                      Aplicación base Electron + React con primer módulo real de Plantilla: listado,
                      búsqueda, filtros, alta manual, edición, borrado lógico e importación Excel.
                    </p>
                  </div>
                </div>
              </section>
              <DashboardCards />
            </>
          )}
          {activeView === 'plantilla' && <PlantillaPage />}
          {activeView === 'tareas' && <TareasPage />}
          {activeView === 'peticiones' && <PeticionesPage />}
          {activeView === 'teletrabajo' && <TeletrabajoPage />}
          {activeView === 'ticket-restaurante' && <TicketRestaurantePage />}
          {activeView === 'vinculograma' && <VinculogramaPage />}
          {activeView === 'especiales' && <EspecialesPage />}
          {activeView === 'ajustes' && <AjustesPage />}
        </main>
      </div>
    </div>
  );
}
