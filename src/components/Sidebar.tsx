import { useEffect, useMemo, useState } from 'react';
import { useDatabaseStatus } from '../services/databaseStatus';
import { useExternalDataSyncStatus } from '../services/externalDataSync';
import { readHydrationMetadata, readStorageItem, writeStorageItem } from '../services/persistence';
import { AlertTriangle, Database, Home, LockKeyhole, Pin, PinOff, Settings, X } from 'lucide-react';
import { getGroupForView, navigationGroups, type AppView, type NavigationGroupId } from '../navigation/navigation';

const traccionLogoSrc = '../assets/logo/traccion-logo.png';
const SIDEBAR_PINNED_KEY = 'traccion.sidebar.pinned';
const SIDEBAR_ACTIVE_GROUP_KEY = 'traccion.sidebar.activeGroup';

const isNavigationGroupId = (value: string | null): value is NavigationGroupId =>
  navigationGroups.some((group) => group.id === value);

type DatabaseIndicatorViewModel = {
  label: string;
  statusText: string;
  routeText: string;
  lastSyncText: string;
  syncStatusText: string;
  dotClassName: string;
  textClassName: string;
  icon: 'database' | 'lock';
  requiresAttention: boolean;
};

const formatDatabaseTimestamp = (timestamp: string | null | undefined) => {
  if (!timestamp) {
    return 'Sin sincronización/hidratación registrada';
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
};

const buildDatabaseIndicatorViewModel = (
  databaseStatus: TraccionDatabaseStatus | null,
  syncStatusText: string,
): DatabaseIndicatorViewModel => {
  const hydrationMetadata = typeof window === 'undefined' ? null : readHydrationMetadata();
  const routeText = databaseStatus?.path ?? hydrationMetadata?.sqlitePath ?? 'localStorage local';
  const lastSyncText = formatDatabaseTimestamp(hydrationMetadata?.lastUpdatedAt);

  if (!databaseStatus) {
    return {
      label: 'Local',
      statusText: 'fallback localStorage',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-orange-400 ring-orange-300/25',
      textClassName: 'text-orange-100',
      icon: 'database',
      requiresAttention: true,
    };
  }

  if (databaseStatus.phase === 'locked') {
    return {
      label: 'Bloq.',
      statusText: databaseStatus.message ?? 'base bloqueada',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-slate-400 ring-slate-300/25',
      textClassName: 'text-slate-200',
      icon: 'lock',
      requiresAttention: true,
    };
  }

  if (databaseStatus.phase === 'error') {
    return {
      label: 'Error',
      statusText: databaseStatus.message ?? 'error o ruta no accesible',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-red-500 ring-red-300/25',
      textClassName: 'text-red-100',
      icon: 'database',
      requiresAttention: true,
    };
  }

  if (databaseStatus.ready && !databaseStatus.isDefaultPath) {
    return {
      label: 'SQLite',
      statusText: 'SQLite activa en ruta compartida/personalizada',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-emerald-400 ring-emerald-300/25',
      textClassName: 'text-emerald-100',
      icon: 'database',
      requiresAttention: false,
    };
  }

  if (databaseStatus.ready) {
    return {
      label: 'SQLite',
      statusText: 'SQLite activa en ruta local por defecto',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-sky-400 ring-sky-300/25',
      textClassName: 'text-sky-100',
      icon: 'database',
      requiresAttention: false,
    };
  }

  if (databaseStatus.phase === 'fallback') {
    return {
      label: 'Local',
      statusText: databaseStatus.message ?? 'fallback localStorage',
      routeText,
      lastSyncText,
      syncStatusText,
      dotClassName: 'bg-orange-400 ring-orange-300/25',
      textClassName: 'text-orange-100',
      icon: 'database',
      requiresAttention: true,
    };
  }

  return {
    label: 'Revisar',
    statusText: databaseStatus.message ?? 'ruta no accesible',
    routeText,
    lastSyncText,
    syncStatusText,
    dotClassName: 'bg-red-500 ring-red-300/25',
    textClassName: 'text-red-100',
    icon: 'database',
    requiresAttention: true,
  };
};

const readStoredPinnedPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return readStorageItem(SIDEBAR_PINNED_KEY) === 'true';
};

const readStoredActiveGroup = (activeView: AppView) => {
  if (typeof window === 'undefined') {
    return getGroupForView(activeView) ?? 'personas';
  }

  const storedGroup = readStorageItem(SIDEBAR_ACTIVE_GROUP_KEY);
  return isNavigationGroupId(storedGroup)
    ? storedGroup
    : (getGroupForView(activeView) ?? 'personas');
};

export function Sidebar({
  activeView,
  onDashboardReset,
  onViewChange,
}: {
  activeView: AppView;
  onDashboardReset?: () => void;
  onViewChange: (view: AppView) => void;
}) {
  const [isPinned, setIsPinned] = useState(readStoredPinnedPreference);
  const [activeGroupId, setActiveGroupId] = useState(() => readStoredActiveGroup(activeView));
  const [isPanelOpen, setIsPanelOpen] = useState(() => readStoredPinnedPreference());

  const activeViewGroupId = getGroupForView(activeView);
  const activeGroup = useMemo(
    () => navigationGroups.find((group) => group.id === activeGroupId) ?? navigationGroups[0],
    [activeGroupId],
  );
  const shouldShowPanel = isPanelOpen || isPinned;
  const databaseStatus = useDatabaseStatus();
  const externalDataSyncStatus = useExternalDataSyncStatus();
  const syncStatusText = `${externalDataSyncStatus.message} Última comprobación: ${formatDatabaseTimestamp(
    externalDataSyncStatus.lastCheckedAt,
  )}. Últimos cambios aplicados: ${formatDatabaseTimestamp(externalDataSyncStatus.lastAppliedAt)}.`;
  const databaseIndicator = buildDatabaseIndicatorViewModel(databaseStatus, syncStatusText);
  const databaseIndicatorTooltip = `Ruta activa: ${databaseIndicator.routeText}\nEstado: ${databaseIndicator.statusText}\nÚltima sincronización/hidratación: ${databaseIndicator.lastSyncText}\n${databaseIndicator.syncStatusText}`;

  useEffect(() => {
    writeStorageItem(SIDEBAR_PINNED_KEY, String(isPinned));
  }, [isPinned]);

  useEffect(() => {
    writeStorageItem(SIDEBAR_ACTIVE_GROUP_KEY, activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    if (activeViewGroupId) {
      setActiveGroupId(activeViewGroupId);
    }
  }, [activeViewGroupId]);

  const handleLogoSelect = () => {
    if (!isPinned) {
      setIsPanelOpen(false);
    }

    if (onDashboardReset) {
      onDashboardReset();
      return;
    }

    onViewChange('dashboard');
  };

  const handleHomeSelect = () => {
    onViewChange('dashboard');

    if (!isPinned) {
      setIsPanelOpen(false);
    }
  };

  const handleGroupSelect = (groupId: NavigationGroupId) => {
    setActiveGroupId(groupId);
    setIsPanelOpen(true);
  };

  const handleSettingsSelect = () => {
    onViewChange('ajustes');

    if (!isPinned) {
      setIsPanelOpen(false);
    }
  };

  const handleDatabaseIndicatorSelect = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = 'base-de-datos';
    }

    onViewChange('ajustes');
  };

  const handleViewSelect = (view: AppView) => {
    onViewChange(view);

    if (!isPinned) {
      setIsPanelOpen(false);
    }
  };

  const handlePinToggle = () => {
    setIsPinned((currentPinnedState) => {
      const nextPinnedState = !currentPinnedState;
      setIsPanelOpen(nextPinnedState || isPanelOpen);
      return nextPinnedState;
    });
  };

  return (
    <aside
      className={`relative z-30 h-screen shrink-0 transition-[width] duration-300 ease-out ${
        shouldShowPanel && isPinned ? 'w-[4.5rem] lg:w-[19.5rem]' : 'w-[4.5rem]'
      }`}
    >
      <div className="fixed inset-y-0 left-0 z-40 flex w-[4.5rem] flex-col border-r border-white/10 bg-gradient-to-b from-metro-navy via-metro-topbar to-[#08111F] text-white shadow-2xl shadow-slate-950/40">
        <div className="flex h-16 items-center justify-center border-b border-white/10 px-2">
          <button
            aria-label="Reiniciar TrAccion"
            className="rounded-2xl p-1 transition hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-metro-red/60"
            onClick={handleLogoSelect}
            title="Reiniciar TrAccion"
            type="button"
          >
            <img alt="TrAccion" className="h-11 w-11 object-contain" src={traccionLogoSrc} />
          </button>
        </div>

        <nav
          aria-label="Grupos principales"
          className="flex flex-1 flex-col items-center px-2 py-4"
        >
          <div className="flex flex-col items-center gap-2">
            <button
              aria-current={activeView === 'dashboard' ? 'page' : undefined}
              aria-label="Inicio"
              className={`group/rail relative flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent transition ${
                activeView === 'dashboard'
                  ? 'border-white/10 bg-white/10 text-white shadow-lg shadow-slate-950/25'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
              }`}
              onClick={handleHomeSelect}
              title="Inicio"
              type="button"
            >
              {activeView === 'dashboard' && (
                <span className="absolute left-[-0.5rem] h-7 w-1 rounded-r-full bg-metro-red" />
              )}
              <Home
                className={activeView === 'dashboard' ? 'text-red-200' : undefined}
                size={21}
                strokeWidth={2.1}
              />
              <span className={`pointer-events-none absolute left-14 z-50 rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 transition ${shouldShowPanel ? "hidden" : "group-hover/rail:translate-x-1 group-hover/rail:opacity-100"}`}>
                Inicio
              </span>
            </button>

            {navigationGroups.map((group) => {
              const Icon = group.icon;
              const isActiveGroup = group.id === activeGroupId;
              const containsActiveView = group.id === activeViewGroupId;

              return (
                <button
                  aria-label={group.label}
                  className={`group/rail relative flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent transition ${
                    isActiveGroup || containsActiveView
                      ? 'border-white/10 bg-white/10 text-white shadow-lg shadow-slate-950/25'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
                  }`}
                  key={group.id}
                  onClick={() => handleGroupSelect(group.id)}
                  title={group.label}
                  type="button"
                >
                  {(isActiveGroup || containsActiveView) && (
                    <span className="absolute left-[-0.5rem] h-7 w-1 rounded-r-full bg-metro-red" />
                  )}
                  <Icon
                    className={containsActiveView ? 'text-red-200' : undefined}
                    size={21}
                    strokeWidth={2.1}
                  />
                  <span className={`pointer-events-none absolute left-14 z-50 rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 transition ${shouldShowPanel ? "hidden" : "group-hover/rail:translate-x-1 group-hover/rail:opacity-100"}`}>
                    {group.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto flex flex-col items-center gap-2 border-t border-white/10 pt-3">
            <button
              aria-label={`Estado de base de datos: ${databaseIndicator.statusText}`}
              className="group/rail relative flex w-12 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.035] px-1 py-2 text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-slate-300 transition hover:bg-white/[0.07] hover:text-white"
              onClick={handleDatabaseIndicatorSelect}
              title={databaseIndicatorTooltip}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 items-center justify-center rounded-full ring-4 ${databaseIndicator.dotClassName}`}
              >
                {databaseIndicator.icon === 'lock' ? (
                  <LockKeyhole className="h-2.5 w-2.5 text-slate-950/80" strokeWidth={3} />
                ) : (
                  <Database className="h-2.5 w-2.5 text-slate-950/80" strokeWidth={3} />
                )}
              </span>
              {databaseIndicator.requiresAttention && (
                <AlertTriangle
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-amber-200 drop-shadow"
                  strokeWidth={2.6}
                />
              )}
              <span className="max-w-full truncate">{databaseIndicator.label}</span>
              <span className="pointer-events-none absolute left-14 z-50 w-72 rounded-lg border border-white/10 bg-slate-950/95 px-3 py-2 text-left text-xs font-medium normal-case tracking-normal text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 transition ${shouldShowPanel ? 'hidden' : 'group-hover/rail:translate-x-1 group-hover/rail:opacity-100'}">
                <span className="block font-semibold">{databaseIndicator.statusText}</span>
                <span className="mt-1 block break-all text-slate-300">
                  {databaseIndicator.routeText}
                </span>
                <span className="mt-1 block text-slate-400">{databaseIndicator.lastSyncText}</span>
              </span>
            </button>

            <button
              aria-current={activeView === 'ajustes' ? 'page' : undefined}
              aria-label="Ajustes"
              className={`group/rail relative flex h-12 w-12 items-center justify-center rounded-2xl border border-transparent transition ${
                activeView === 'ajustes'
                  ? 'border-white/10 bg-white/10 text-white shadow-lg shadow-slate-950/25'
                  : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-100'
              }`}
              onClick={handleSettingsSelect}
              title="Ajustes"
              type="button"
            >
              {activeView === 'ajustes' && (
                <span className="absolute left-[-0.5rem] h-7 w-1 rounded-r-full bg-metro-red" />
              )}
              <Settings
                className={activeView === 'ajustes' ? 'text-red-200' : undefined}
                size={21}
                strokeWidth={2.1}
              />
              <span className={`pointer-events-none absolute left-14 z-50 rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 transition ${shouldShowPanel ? "hidden" : "group-hover/rail:translate-x-1 group-hover/rail:opacity-100"}`}>
                Ajustes
              </span>
            </button>
          </div>
        </nav>
      </div>

      {shouldShowPanel && (
        <div className="fixed inset-y-0 left-[4.5rem] z-30 flex w-60 flex-col border-r border-slate-700/80 bg-[#0F172A]/98 text-white shadow-2xl shadow-slate-950/45 backdrop-blur-xl transition-transform duration-300 ease-out">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-metro-red">
                Navegación
              </p>
              <h2 className="truncate text-base font-semibold text-metro-text">
                {activeGroup.label}
              </h2>
            </div>
            <div className="flex items-center gap-1">
              <button
                aria-label={isPinned ? 'Desfijar panel' : 'Fijar panel'}
                className={`rounded-full border p-2 transition ${
                  isPinned
                    ? 'border-red-400/30 bg-red-500/10 text-red-100 hover:bg-red-500/15'
                    : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08] hover:text-white'
                }`}
                onClick={handlePinToggle}
                title={isPinned ? 'Desfijar panel' : 'Fijar panel'}
                type="button"
              >
                {isPinned ? <Pin size={15} /> : <PinOff size={15} />}
              </button>
              <button
                aria-label="Cerrar panel"
                className="rounded-full border border-white/10 bg-white/[0.04] p-2 text-slate-300 transition hover:bg-white/[0.08] hover:text-white"
                onClick={() => setIsPanelOpen(false)}
                title="Cerrar panel"
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="border-b border-white/10 px-4 py-4">
            <p className="text-sm leading-5 text-metro-muted">{activeGroup.description}</p>
          </div>

          <nav
            aria-label={`Opciones de ${activeGroup.label}`}
            className="flex-1 space-y-1 px-3 py-4"
          >
            {activeGroup.items.map((item) => {
              const Icon = item.icon;
              const isActiveItem = item.view === activeView;

              return (
                <button
                  aria-current={isActiveItem ? 'page' : undefined}
                  className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    isActiveItem
                      ? 'bg-white/10 text-metro-text shadow-sm shadow-slate-950/20'
                      : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                  } ${item.disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-slate-300' : ''}`}
                  disabled={item.disabled}
                  key={item.label}
                  onClick={() => item.view && handleViewSelect(item.view)}
                  title={item.disabled ? 'Módulo no disponible en este paquete' : item.label}
                  type="button"
                >
                  {isActiveItem && (
                    <span className="absolute left-0 h-6 w-0.5 rounded-r-full bg-metro-red" />
                  )}
                  <Icon size={18} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-slate-500">
            <button
              aria-label={`Estado de base de datos: ${databaseIndicator.statusText}`}
              className="mb-3 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-left transition hover:bg-white/[0.07]"
              onClick={handleDatabaseIndicatorSelect}
              title={databaseIndicatorTooltip}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-4 ${databaseIndicator.dotClassName}`}
              >
                {databaseIndicator.icon === 'lock' ? (
                  <LockKeyhole className="h-2.5 w-2.5 text-slate-950/80" strokeWidth={3} />
                ) : (
                  <Database className="h-2.5 w-2.5 text-slate-950/80" strokeWidth={3} />
                )}
              </span>
              {databaseIndicator.requiresAttention && (
                <AlertTriangle
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-amber-200"
                  strokeWidth={2.5}
                />
              )}
              <span className="min-w-0">
                <span className={`block truncate font-semibold ${databaseIndicator.textClassName}`}>
                  {databaseIndicator.label}
                </span>
                <span className="block truncate text-[0.68rem] text-slate-400">
                  {databaseIndicator.statusText}
                </span>
                <span className="block truncate text-[0.68rem] text-slate-500">
                  {externalDataSyncStatus.message}
                </span>
              </span>
            </button>
            {isPinned
              ? 'Panel fijado: el área principal reserva espacio en escritorio.'
              : 'Panel temporal: se oculta al abrir un módulo.'}
          </div>
        </div>
      )}
    </aside>
  );
}
