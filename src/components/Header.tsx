import { Bell, Search } from 'lucide-react';

export function Header() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-metro-border bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold text-metro-text">Inicio</h1>
        <p className="text-xs text-metro-muted">Base moderna para gestión RRLL y plantilla.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-metro-border bg-metro-surface px-3 py-2 text-sm text-metro-muted md:flex">
          <Search size={16} /> Buscar módulos, empleados o acciones
        </div>
        <button className="rounded-full border border-metro-border p-2 text-metro-muted hover:text-metro-text" type="button">
          <Bell size={18} />
        </button>
      </div>
    </header>
  );
}
