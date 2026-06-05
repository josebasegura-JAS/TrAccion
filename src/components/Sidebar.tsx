import { BarChart3, ClipboardList, Database, Home, Settings, UsersRound } from 'lucide-react';

export type AppView = 'dashboard' | 'plantilla' | 'tareas';

export function Sidebar({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const navButtonClass = (view: AppView) =>
    `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
      activeView === view
        ? 'bg-metro-red text-white shadow-lg shadow-red-950/25'
        : 'text-white/80 hover:bg-white/10'
    }`;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-[#252B34] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/55">Metro</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">RRLL PRO</div>
        <div className="mt-2 rounded-full bg-metro-red/15 px-3 py-1 text-xs font-medium text-red-100">
          TrAccion V1
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 text-sm font-medium">
        <button
          className={navButtonClass('dashboard')}
          onClick={() => onViewChange('dashboard')}
          type="button"
        >
          <Home size={18} /> Inicio
        </button>
        <button
          className={navButtonClass('plantilla')}
          onClick={() => onViewChange('plantilla')}
          type="button"
        >
          <UsersRound size={18} /> Plantilla
        </button>
        <button
          className={navButtonClass('tareas')}
          onClick={() => onViewChange('tareas')}
          type="button"
        >
          <ClipboardList size={18} /> Tareas
        </button>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/60"
          type="button"
        >
          <Database size={18} /> Datos
        </button>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-white/60"
          type="button"
        >
          <BarChart3 size={18} /> Informes
        </button>
      </nav>

      <div className="border-t border-white/10 p-3 text-sm text-white/60">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Settings size={18} /> Configuración
        </div>
      </div>
    </aside>
  );
}
