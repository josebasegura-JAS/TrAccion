import { useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { getNavigationBreadcrumb, type AppView } from '../navigation/navigation';
import { GlobalSearch } from './GlobalSearch';
import { ModuleHelpButton } from './ModuleHelp';
import { useModuleHelpRegistry } from '../services/moduleHelpRegistry';
import { useDatabaseStatus } from '../services/databaseStatus';
import { useExternalDataSyncStatus } from '../services/externalDataSync';
import { readStorageItem, writeStorageItem } from '../services/persistence';

const viewHeaderCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Dashboard RRLL',
    subtitle: 'Prioridades, agenda y próximos hitos.',
  },
  plantilla: {
    title: 'Plantilla',
    subtitle: 'Gestión de personas, puestos, datos laborales y traducciones.',
  },
  tareas: {
    title: 'Tareas',
    subtitle: 'Seguimiento por fase, estado, prioridad y vencimiento.',
  },
  comite: {
    title: 'Comité / Paritaria',
    subtitle: 'Gestión unificada de sesiones, puntos y clasificación por órgano.',
  },
  actas: {
    title: 'Actas',
    subtitle: 'Actas de Comité y Paritaria, estados y alegaciones sindicales.',
  },
  paritaria: {
    title: 'Comisión Paritaria',
    subtitle: 'Sesiones, puntos del orden del día y tareas tratadas.',
  },
  'criterios-rrll': {
    title: 'Criterios RRLL',
    subtitle: 'Criterios internos, consultas y referencias de aplicación.',
  },
  teletrabajo: {
    title: 'Teletrabajo',
    subtitle: 'Solicitudes, validaciones, campañas y documentación asociada.',
  },
  'ticket-restaurante': {
    title: 'Ticket Restaurante',
    subtitle: 'Calendarios, ausencias, cálculo mensual y cotización.',
  },
  presupuestos: {
    title: 'Presupuestos RRLL',
    subtitle: 'Escenarios presupuestarios, simulación anual y comparativa con reales.',
  },
  'licencias-sin-sueldo': {
    title: 'Licencias sin sueldo',
    subtitle: 'Permisos no retribuidos por aprobación, firma, vigencia e histórico.',
  },
  sorteos: {
    title: 'Sorteos',
    subtitle: 'Creación de sorteos, exclusiones e histórico de resultados.',
  },
  loteria: {
    title: 'Lotería',
    subtitle: 'Campaña anual, solicitudes de décimos, cobros y control de caja.',
  },
  vinculograma: {
    title: 'Vinculograma',
    subtitle: 'Vinculaciones vigentes e histórico entre personas y áreas.',
  },
  especiales: {
    title: 'Especiales',
    subtitle: 'Comunicaciones, eventos y borradores de correo operativo.',
  },
  ajustes: {
    title: 'Ajustes',
    subtitle: 'Configuración de persistencia, datos y parámetros de la aplicación.',
  },
};

const getFallbackUserName = () => {
  if (typeof window === 'undefined') {
    return 'Usuario local';
  }

  return readStorageItem('traccion.header.username') ?? 'Usuario local';
};

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (target: { view: AppView; recordId?: string }) => void;
}) {
  const [windowsUserName, setWindowsUserName] = useState(getFallbackUserName);
  const headerCopy = useMemo(() => viewHeaderCopy[activeView], [activeView]);
  const breadcrumb = useMemo(() => getNavigationBreadcrumb(activeView), [activeView]);
  const moduleHelp = useModuleHelpRegistry((state) => state.content);
  const dbStatus = useDatabaseStatus();
  const syncStatus = useExternalDataSyncStatus();

  const syncDotClass = !dbStatus?.ready
    ? 'bg-orange-400'
    : syncStatus.status === 'error'
      ? 'bg-red-500'
      : syncStatus.status === 'checking'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-emerald-400';

  useEffect(() => {
    let isMounted = true;

    window.traccion
      ?.getWindowsUser?.()
      .then((userName) => {
        const normalizedUserName = userName?.trim() || 'Usuario local';
        if (!isMounted) {
          return;
        }

        setWindowsUserName(normalizedUserName);
        writeStorageItem('traccion.header.username', normalizedUserName);
      })
      .catch(() => {
        if (isMounted) {
          setWindowsUserName('Usuario local');
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <header className="border-b border-white/5 px-4 pb-3 pt-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-[24px] border border-white/10 bg-gradient-to-r from-metro-topbar via-metro-navy to-metro-topbar px-5 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.26)]">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex min-w-0 items-center gap-2">
              <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-metro-muted">
                {breadcrumb}
              </span>
              {moduleHelp ? (
                <ModuleHelpButton
                  title={moduleHelp.title}
                  subtitle={moduleHelp.subtitle}
                  sections={moduleHelp.sections}
                />
              ) : null}
            </div>
            <h1 className="truncate text-[1.45rem] font-black tracking-tight text-metro-text">
              {headerCopy.title}
            </h1>
            <p className="truncate text-sm text-metro-muted">{headerCopy.subtitle}</p>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-3">
          <div className="min-w-[18rem] max-w-[28rem] flex-1">
            <GlobalSearch onNavigate={onViewChange} />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2.5 shadow-sm shadow-slate-950/20">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-metro-red/12 text-metro-red ring-1 ring-metro-red/20">
              <UserRound size={18} />
              <span
                aria-label={`Estado de sincronización: ${syncStatus.message}`}
                className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-metro-topbar ${syncDotClass}`}
                data-tip={syncStatus.message}
              />
            </div>
            <div className="hidden min-w-0 sm:block">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-metro-muted">
                Usuario activo
              </p>
              <p className="max-w-[11rem] truncate text-sm font-semibold text-metro-text">
                {windowsUserName}
              </p>
              <p className="max-w-[13rem] truncate text-[11px] text-metro-muted">
                {dbStatus?.ready ? 'SQLite activa' : 'Modo local'} · {syncStatus.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
