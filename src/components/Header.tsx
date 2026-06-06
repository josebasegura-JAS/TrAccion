import { Bell, Search } from 'lucide-react';

const traccionLogoSrc = '../assets/logo/traccion-logo.png';

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-metro-border bg-metro-topbar/95 px-6 shadow-sm shadow-slate-950/20">
      <div className="flex items-center gap-3">
        <img alt="TrAccion" className="h-9 w-auto object-contain" src={traccionLogoSrc} />
        <div>
          <h1 className="text-lg font-semibold text-metro-text">Inicio</h1>
          <p className="text-xs text-metro-muted">Base moderna para gestión RRLL y plantilla.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-metro-border bg-metro-panel/80 px-3 py-2 text-sm text-metro-muted md:flex">
          <Search size={16} /> Buscar módulos, empleados o acciones
        </div>
        <button
          className="rounded-full border border-metro-border bg-metro-panel/70 p-2 text-metro-muted transition hover:border-metro-red/60 hover:text-metro-text"
          type="button"
        >
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
