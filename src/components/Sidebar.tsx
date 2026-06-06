import {
  BarChart3,
  ClipboardList,
  Database,
  FileText,
  ListChecks,
  Home,
  MailPlus,
  Laptop,
  Link2,
  Settings,
  Utensils,
  UsersRound,
} from 'lucide-react';

const traccionLogoSrc = '../assets/logo/traccion-logo.png';

export type AppView =
  | 'dashboard'
  | 'plantilla'
  | 'tareas'
  | 'peticiones'
  | 'criterios-rrll'
  | 'teletrabajo'
  | 'ticket-restaurante'
  | 'vinculograma'
  | 'especiales'
  | 'ajustes';

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
        ? 'bg-metro-red/95 text-white shadow-lg shadow-red-950/25 ring-1 ring-red-400/20'
        : 'text-slate-300 hover:bg-white/[0.08] hover:text-white'
    }`;

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-metro-navy via-metro-topbar to-metro-slate text-white shadow-2xl shadow-slate-950/30">
      <div className="border-b border-white/10 px-5 py-5">
        <img alt="TrAccion" className="mx-auto h-20 w-auto object-contain" src={traccionLogoSrc} />
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
          className={navButtonClass('peticiones')}
          onClick={() => onViewChange('peticiones')}
          type="button"
        >
          <FileText size={18} /> Peticiones
        </button>
        <button
          className={navButtonClass('criterios-rrll')}
          onClick={() => onViewChange('criterios-rrll')}
          type="button"
        >
          <ListChecks size={18} /> Criterios RRLL
        </button>
        <button
          className={navButtonClass('teletrabajo')}
          onClick={() => onViewChange('teletrabajo')}
          type="button"
        >
          <Laptop size={18} /> Teletrabajo
        </button>
        <button
          className={navButtonClass('ticket-restaurante')}
          onClick={() => onViewChange('ticket-restaurante')}
          type="button"
        >
          <Utensils size={18} /> Ticket Restaurante
        </button>
        <button
          className={navButtonClass('vinculograma')}
          onClick={() => onViewChange('vinculograma')}
          type="button"
        >
          <Link2 size={18} /> Vinculograma
        </button>
        <button
          className={navButtonClass('especiales')}
          onClick={() => onViewChange('especiales')}
          type="button"
        >
          <MailPlus size={18} /> Especiales
        </button>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-slate-500"
          type="button"
        >
          <Database size={18} /> Datos
        </button>
        <button
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-slate-500"
          type="button"
        >
          <BarChart3 size={18} /> Informes
        </button>
      </nav>

      <div className="border-t border-white/10 p-3 text-sm">
        <button
          className={navButtonClass('ajustes')}
          onClick={() => onViewChange('ajustes')}
          type="button"
        >
          <Settings size={18} /> Configuración
        </button>
      </div>
    </aside>
  );
}
