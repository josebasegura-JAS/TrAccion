import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardList,
  Database,
  FileText,
  Gift,
  Home,
  Laptop,
  LayoutDashboard,
  Link2,
  MailPlus,
  Pin,
  PinOff,
  Settings,
  ShieldCheck,
  Utensils,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react';

const traccionLogoSrc = '../assets/logo/traccion-logo.png';
const SIDEBAR_PINNED_KEY = 'traccion.sidebar.pinned';
const SIDEBAR_ACTIVE_GROUP_KEY = 'traccion.sidebar.activeGroup';

export type AppView =
  | 'dashboard'
  | 'plantilla'
  | 'tareas'
  | 'peticiones'
  | 'criterios-rrll'
  | 'teletrabajo'
  | 'ticket-restaurante'
  | 'sorteos'
  | 'vinculograma'
  | 'especiales'
  | 'ajustes';

type NavigationGroupId = 'general' | 'personas' | 'gestion' | 'organos' | 'sistema';

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  view?: AppView;
  disabled?: boolean;
};

type NavigationGroup = {
  id: NavigationGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Vista principal',
    icon: Home,
    items: [{ label: 'Inicio', icon: LayoutDashboard, view: 'dashboard' }],
  },
  {
    id: 'personas',
    label: 'Personas',
    description: 'Plantilla y teletrabajo',
    icon: UsersRound,
    items: [
      { label: 'Plantilla', icon: UsersRound, view: 'plantilla' },
      { label: 'Teletrabajo', icon: Laptop, view: 'teletrabajo' },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestión',
    description: 'Operativa RRLL',
    icon: BriefcaseBusiness,
    items: [
      { label: 'Tareas', icon: ClipboardList, view: 'tareas' },
      { label: 'Peticiones', icon: FileText, view: 'peticiones' },
      { label: 'Criterios RRLL', icon: ShieldCheck, view: 'criterios-rrll' },
      { label: 'Ticket Restaurante', icon: Utensils, view: 'ticket-restaurante' },
      { label: 'Sorteos', icon: Gift, view: 'sorteos' },
      { label: 'Vinculograma', icon: Link2, view: 'vinculograma' },
      { label: 'Especiales', icon: MailPlus, view: 'especiales' },
    ],
  },
  {
    id: 'sistema',
    label: 'Sistema',
    description: 'Datos, informes y ajustes',
    icon: Settings,
    items: [
      { label: 'Datos', icon: Database, disabled: true },
      { label: 'Informes', icon: BarChart3, disabled: true },
      { label: 'Ajustes', icon: Settings, view: 'ajustes' },
    ],
  },
];

const getGroupForView = (view: AppView): NavigationGroupId => {
  const group = navigationGroups.find((navigationGroup) =>
    navigationGroup.items.some((item) => item.view === view),
  );

  return group?.id ?? 'general';
};

const isNavigationGroupId = (value: string | null): value is NavigationGroupId =>
  navigationGroups.some((group) => group.id === value);

const readStoredPinnedPreference = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_PINNED_KEY) === 'true';
};

const readStoredActiveGroup = (activeView: AppView) => {
  if (typeof window === 'undefined') {
    return getGroupForView(activeView);
  }

  const storedGroup = window.localStorage.getItem(SIDEBAR_ACTIVE_GROUP_KEY);
  return isNavigationGroupId(storedGroup) ? storedGroup : getGroupForView(activeView);
};

export function Sidebar({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
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

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_PINNED_KEY, String(isPinned));
  }, [isPinned]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_ACTIVE_GROUP_KEY, activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    setActiveGroupId(activeViewGroupId);
  }, [activeViewGroupId]);

  const handleGroupSelect = (groupId: NavigationGroupId) => {
    setActiveGroupId(groupId);
    setIsPanelOpen(true);
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
          <img alt="TrAccion" className="h-11 w-11 object-contain" src={traccionLogoSrc} />
        </div>

        <nav aria-label="Grupos principales" className="flex flex-1 flex-col items-center gap-2 px-2 py-4">
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
                <span className="pointer-events-none absolute left-14 z-50 rounded-lg border border-white/10 bg-slate-950/95 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100 opacity-0 shadow-xl shadow-slate-950/40 transition group-hover/rail:translate-x-1 group-hover/rail:opacity-100">
                  {group.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {shouldShowPanel && (
        <div className="fixed inset-y-0 left-[4.5rem] z-30 flex w-60 flex-col border-r border-slate-700/80 bg-[#0F172A]/98 text-white shadow-2xl shadow-slate-950/45 backdrop-blur-xl transition-transform duration-300 ease-out">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-metro-red">
                Navegación
              </p>
              <h2 className="truncate text-base font-semibold text-metro-text">{activeGroup.label}</h2>
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

          <nav aria-label={`Opciones de ${activeGroup.label}`} className="flex-1 space-y-1 px-3 py-4">
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
            {isPinned
              ? 'Panel fijado: el área principal reserva espacio en escritorio.'
              : 'Panel temporal: se oculta al abrir un módulo.'}
          </div>
        </div>
      )}
    </aside>
  );
}
