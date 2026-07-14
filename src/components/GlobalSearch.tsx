import { ModalCloseButton } from './ui/ModalCloseButton';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { AppView } from '../navigation/navigation';
import { StatusBadge } from './ui/StatusBadge';
import {
  MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH,
  getParsedSearchSummary,
  getResultYearLabel,
  searchTraccion,
  type GlobalSearchResult,
} from '../services/globalSearch';

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


const ALL_MODULES_FILTER = 'all';
const ALL_YEARS_FILTER = 'all';
const RECENT_SEARCHES_STORAGE_KEY = 'traccion.v1.global-search.recent';
const MAX_RECENT_SEARCHES = 6;

type ModuleFilter = typeof ALL_MODULES_FILTER | AppView;
type YearFilter = typeof ALL_YEARS_FILTER | number;

function isClosedStatus(value: string | undefined): boolean {
  const normalized = value?.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim() ?? '';
  return ['cerrad', 'finalizad', 'histor', 'firmad', 'resuelt'].some((closedStatus) => normalized.includes(closedStatus));
}

function getFilterButtonClass(isActive: boolean): string {
  return [
    'rounded-full border px-3 py-1 text-[11px] font-semibold transition',
    isActive
      ? 'border-metro-red/50 bg-metro-red/15 text-metro-text'
      : 'border-metro-border bg-slate-950/20 text-metro-muted hover:border-metro-red/35 hover:text-metro-text',
  ].join(' ');
}

function groupResults(results: GlobalSearchResult[]): GroupedResults[] {
  const yearMap = new Map<number, Map<string, GlobalSearchResult[]>>();

  for (const result of results) {
    const moduleMap = yearMap.get(result.year) ?? new Map<string, GlobalSearchResult[]>();
    const moduleResults = moduleMap.get(result.module) ?? [];
    moduleResults.push(result);
    moduleMap.set(result.module, moduleResults);
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


function readRecentSearches(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(searches: string[]): void {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // La búsqueda no debe fallar porque no pueda guardar el historial local.
  }
}

function buildQuickSearch(label: string, query: string): { label: string; query: string } {
  return { label, query };
}

const QUICK_SEARCHES = [
  buildQuickSearch('Paritaria 2024', 'modulo:paritaria año:2024'),
  buildQuickSearch('Actas pendientes', 'modulo:actas pendiente'),
  buildQuickSearch('Tareas vencidas', 'modulo:tareas vencido'),
  buildQuickSearch('Teletrabajo', 'modulo:teletrabajo'),
];


function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
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
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>(ALL_MODULES_FILTER);
  const [yearFilter, setYearFilter] = useState<YearFilter>(ALL_YEARS_FILTER);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const debouncedQuery = useDebouncedValue(query, 180);
  const trimmedQuery = query.trim();
  const debouncedTrimmedQuery = debouncedQuery.trim();
  const parsedSearchSummary = useMemo(() => getParsedSearchSummary(debouncedQuery), [debouncedQuery]);
  const canSearch =
    debouncedTrimmedQuery.length >= MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH ||
    parsedSearchSummary.length > 0;
  const results = useMemo(
    () => (canSearch ? searchTraccion(debouncedQuery) : []),
    [canSearch, debouncedQuery],
  );
  const moduleOptions = useMemo(
    () => Array.from(new Map(results.map((result) => [result.moduleView, result.module])).entries()),
    [results],
  );
  const yearOptions = useMemo(
    () => Array.from(new Set(results.map((result) => result.year))).sort((first, second) => second - first),
    [results],
  );
  const filteredResults = useMemo(
    () =>
      results.filter((result) => {
        if (moduleFilter !== ALL_MODULES_FILTER && result.moduleView !== moduleFilter) {
          return false;
        }
        if (yearFilter !== ALL_YEARS_FILTER && result.year !== yearFilter) {
          return false;
        }
        if (onlyOpen && isClosedStatus(result.status)) {
          return false;
        }
        return true;
      }),
    [moduleFilter, onlyOpen, results, yearFilter],
  );
  const groupedResults = useMemo(() => groupResults(filteredResults), [filteredResults]);

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

  const applySearch = (nextQuery: string) => {
    setQuery(nextQuery);
    setIsOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const rememberSearch = (rawQuery: string) => {
    const normalizedQuery = rawQuery.trim();
    if (
      normalizedQuery.length < MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH &&
      getParsedSearchSummary(normalizedQuery).length === 0
    ) {
      return;
    }

    const nextSearches = [normalizedQuery, ...recentSearches.filter((item) => item !== normalizedQuery)].slice(0, MAX_RECENT_SEARCHES);
    setRecentSearches(nextSearches);
    writeRecentSearches(nextSearches);
  };

  const handleResultClick = (result: GlobalSearchResult) => {
    rememberSearch(query);

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
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && filteredResults[0]) {
                    event.preventDefault();
                    handleResultClick(filteredResults[0]);
                  }
                }}
                placeholder="Buscar por persona, tarea, origen, fecha, módulo..."
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-metro-text outline-none placeholder:text-metro-muted"
              />
              <ModalCloseButton label="Cerrar búsqueda" onClick={closeSearch} />
            </div>

            {trimmedQuery.length < MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH && parsedSearchSummary.length === 0 && (
              <div className="border-b border-metro-border bg-slate-950/10 px-4 py-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-metro-muted">Búsquedas rápidas</div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_SEARCHES.map((quickSearch) => (
                    <button
                      key={quickSearch.query}
                      type="button"
                      className={getFilterButtonClass(false)}
                      onClick={() => applySearch(quickSearch.query)}
                    >
                      {quickSearch.label}
                    </button>
                  ))}
                  {recentSearches.map((recentSearch) => (
                    <button
                      key={recentSearch}
                      type="button"
                      className={getFilterButtonClass(false)}
                      onClick={() => applySearch(recentSearch)}
                    >
                      {recentSearch}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-metro-muted">
                  Sintaxis avanzada: modulo:paritaria · año:2024 · estado:pendiente · codigo:24-PE · persona:garcia · empleado:1234 · vencido · abierto · cerrado.
                </p>
              </div>
            )}

            {parsedSearchSummary.length > 0 && (
              <div className="border-b border-metro-border bg-slate-950/10 px-4 py-2 text-[11px] text-metro-muted">
                Filtros detectados: <span className="font-semibold text-metro-text">{parsedSearchSummary.join(' · ')}</span>
              </div>
            )}

            {canSearch && results.length > 0 && (
              <div className="space-y-2 border-b border-metro-border bg-slate-950/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={getFilterButtonClass(moduleFilter === ALL_MODULES_FILTER)}
                    onClick={() => setModuleFilter(ALL_MODULES_FILTER)}
                  >
                    Todos
                  </button>
                  {moduleOptions.map(([moduleView, module]) => (
                    <button
                      key={moduleView}
                      type="button"
                      className={getFilterButtonClass(moduleFilter === moduleView)}
                      onClick={() => setModuleFilter(moduleView)}
                    >
                      {module}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={getFilterButtonClass(yearFilter === ALL_YEARS_FILTER)}
                    onClick={() => setYearFilter(ALL_YEARS_FILTER)}
                  >
                    Todos los años
                  </button>
                  {yearOptions.slice(0, 8).map((year) => (
                    <button
                      key={year}
                      type="button"
                      className={getFilterButtonClass(yearFilter === year)}
                      onClick={() => setYearFilter(year)}
                    >
                      {getResultYearLabel(year)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={getFilterButtonClass(onlyOpen)}
                    onClick={() => setOnlyOpen((current) => !current)}
                  >
                    Solo abiertos
                  </button>
                </div>
              </div>
            )}

            <div className="min-h-[16rem] overflow-auto p-4">
              {trimmedQuery.length < MIN_GLOBAL_SEARCH_FREE_TEXT_LENGTH && parsedSearchSummary.length === 0 && (
                <div className="rounded-2xl border border-dashed border-metro-border bg-slate-950/15 p-6 text-sm text-metro-muted">
                  Escribe al menos 3 caracteres o usa filtros avanzados. Ejemplos: modulo:paritaria año:2024, codigo:24-PE, persona:garcia, vencido.
                </div>
              )}

              {canSearch && results.length === 0 && (
                <div className="rounded-2xl border border-dashed border-metro-border bg-slate-950/15 p-6 text-sm text-metro-muted">
                  No hay resultados para “{query.trim()}”.
                </div>
              )}

              {canSearch && results.length > 0 && filteredResults.length === 0 && (
                <div className="rounded-2xl border border-dashed border-metro-border bg-slate-950/15 p-6 text-sm text-metro-muted">
                  No hay resultados con los filtros actuales.
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
                                  <p className="mt-1 line-clamp-1 text-[11px] font-medium text-metro-red/90">{result.matchReason}</p>
                                </div>
                                <div className="flex flex-none flex-col items-end gap-1">
                                  <StatusBadge size="xs" tone="muted">
                                    {formatResultDate(result.date)}
                                  </StatusBadge>
                                  <StatusBadge size="xs" tone="muted">
                                    Relevancia {result.score}
                                  </StatusBadge>
                                </div>
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
              Enter abre el primer resultado. Puedes combinar texto libre con filtros: modulo, año, estado, codigo, persona, empleado, abierto, cerrado o vencido.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
