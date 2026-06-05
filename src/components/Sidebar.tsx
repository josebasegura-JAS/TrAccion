import { BarChart3, Database, Home, Settings, UsersRound } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col bg-[#17191F] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/50">Metro</div>
        <div className="mt-1 text-2xl font-bold tracking-tight">RRLL PRO</div>
        <div className="mt-2 rounded-full bg-metro-red/15 px-3 py-1 text-xs font-medium text-red-100">
          TrAccion V1
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 text-sm font-medium">
        <a className="flex items-center gap-3 rounded-xl bg-metro-red px-3 py-2.5 shadow-lg shadow-red-950/30" href="#inicio">
          <Home size={18} /> Inicio
        </a>
        <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/82 hover:bg-white/8" href="#plantilla">
          <UsersRound size={18} /> Plantilla
        </a>
        <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/60" href="#datos">
          <Database size={18} /> Datos
        </a>
        <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-white/60" href="#informes">
          <BarChart3 size={18} /> Informes
        </a>
      </nav>

      <div className="border-t border-white/10 p-3 text-sm text-white/60">
        <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <Settings size={18} /> Configuración
        </div>
      </div>
    </aside>
  );
}
