import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { AppView } from './Sidebar';
import { getResultYearLabel, searchTraccion, type GlobalSearchResult } from '../services/globalSearch';

interface GlobalSearchNavigationTarget {
  view: AppView;
  recordId?: string;
}

interface GlobalSearchProps {
  onNavigate: (target: GlobalSearchNavigationTarget) => void;
}

interface GroupedResults {
  year: number;
  modules: {
    module: string;
    results: GlobalSearchResult[];
  }[];
}

function groupResults(results: GlobalSearchResult[]): GroupedResults[] {
  const yearMap = new Map<number, Map<string, GlobalSearchResult[]>>();

  for (const result of results) {
    const moduleMap = yearMap.get(result.year) ?? new Map<string, GlobalSearchResult[]>();
    const moduleResults = moduleMap.get(result.module) ?? [];
    moduleMap.set(result.module, [...moduleResults, result]);
    yearMap.set(result.year, moduleMap);
  }

  return Array.from(yearMap.entries()).map(([year, moduleMap]) => ({
    year,
    modules: Array.from(moduleMap.entries()).map(([module, moduleResults]) => ({
      module,
      results: moduleResults,
    })),
  }));
}

function formatResultDate(value: string): string {
  if (!value) {
    return 'Sin fecha';
  }

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-ES');
}

export function GlobalSearch({ onNavigate }: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const results = useMemo(() => searchTraccion(query), [query]);
  const groupedResults = useMemo(() => groupResults(results), [results]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
      if (isSearchShortcut) {
        event.preventDefault();
        setIsOpen(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
        return;
      }

      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const openSearch = () => {
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const closeSearch = () => {
    setIsOpen(false);
  };

  const handleResultClick = (result: GlobalSearchResult) => {
    onNavigate({ view: result.moduleView, recordId: result.recordId });
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="hidden min-w-[18rem] items-center gap-2 rounded-2xl border border-metro-border bg-metro-panel/80 px-4 py-2 text-left text-sm text-metro-muted shadow-inner shadow-slate-950/10 transition hover:border-metro-red/40 hover:text-metro-text lg:flex xl:min-w-[26rem]"
        onClick={openSearch}
        aria-label="Buscar en TrAccion"
      >
        <Search className="flex-none" size={17} />
        <span className="truncate">Buscar en TrAccion...</span>
        <kbd className="ml-auto rounded-md border border-metro-border bg-slate-950/25 px-1.5 py-0.5 text-[10px] font-semibold text-metro-muted">
          Ctrl K
        </kbd>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/55 px-4 py-16 backdrop-blur-sm" onMouseDown={closeSearch}>
          <div
            className="mx-auto flex max-h-[78vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-metro-border bg-metro-panel shadow-2xl shadow-slate-950/50"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-metro-border bg-metro-topbar/70 px-4 py-3">
              <Search className="flex-none text-metro-muted" size={18} />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por persona, tarea, sindicato, fecha, módulo..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-metro-text outline-none placeholder:text-metro-muted"
              />
              <button
                type="button"
                className="rounded-full p-2 text-metro-muted transition hover:bg-white/5 hover:text-metro-text"
                onClick={closeSearch}
                aria-label="Cerrar búsqueda"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-[16rem] overflow-auto p-4">
              {query.trim().length < 2 && (
                <div className="rounded-2xl border border-dashed border-metro-border bg-slate-950/15 p-6 text-sm text-metro-muted">
                  Escribe al menos 2 caracteres. Los resultados se agrupan por año descendente y módulo.
                </div>
              )}

              {query.trim().length >= 2 && results.length === 0 && (
                <div className="rounded-2xl border border-dashed border-metro-border bg-slate-950/15 p-6 text-sm text-metro-muted">
                  No hay resultados para “{query.trim()}”.
                </div>
              )}

              {groupedResults.map((yearGroup) => (
                <section key={yearGroup.year} className="mb-5 last:mb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-metro-muted">
                      {getResultYearLabel(yearGroup.year)}
                    </h2>
                    <span className="text-[11px] text-metro-muted">
                      {yearGroup.modules.reduce((total, moduleGroup) => total + moduleGroup.results.length, 0)} resultados
                    </span>
                  </div>

                  <div className="space-y-3">
                    {yearGroup.modules.map((moduleGroup) => (
                      <div key={`${yearGroup.year}-${moduleGroup.module}`} className="rounded-2xl border border-metro-border bg-slate-950/10 p-2">
                        <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-metro-red">
                          {moduleGroup.module}
                        </div>
                        <div className="space-y-1">
                          {moduleGroup.results.map((result) => (
                            <button
                              key={`${result.module}-${result.recordId}-${result.id}`}
                              type="button"
                              className="w-full rounded-xl px-3 py-2 text-left transition hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                              onClick={() => handleResultClick(result)}
                            >
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-metro-text">{result.title}</p>
                                  <p className="line-clamp-2 text-xs text-metro-muted">{result.subtitle || 'Sin detalle adicional'}</p>
                                </div>
                                <span className="flex-none rounded-full border border-metro-border bg-slate-950/20 px-2 py-0.5 text-[11px] text-metro-muted">
                                  {formatResultDate(result.date)}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <div className="border-t border-metro-border px-4 py-2 text-[11px] text-metro-muted">
              Selecciona un resultado para abrir su módulo y, cuando esté disponible, el registro concreto.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
