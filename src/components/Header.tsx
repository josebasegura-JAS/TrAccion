import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, WifiOff } from 'lucide-react';
import { getNavigationBreadcrumb, getNavigationIcon, type AppView } from '../navigation/navigation';
import { GlobalSearch } from './GlobalSearch';
import { ModuleHelpButton } from './ModuleHelp';
import { TaskNotificationsBell } from './TaskNotificationsBell';
import { useModuleHelpRegistry } from '../services/moduleHelpRegistry';
import { useDatabaseStatus } from '../services/databaseStatus';
import { useDatabaseConnectivityState } from '../services/databaseConnectivityState';
import { useExternalDataSyncStatus } from '../services/externalDataSync';
import { readStorageItem, writeStorageItem } from '../services/persistence';
import { subscribeToAppNavigation } from '../services/appNavigationBus';

const viewHeaderCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard RRLL', subtitle: 'Prioridades, agenda y próximos hitos.' },
  plantilla: { title: 'Plantilla', subtitle: 'Gestión de personas, puestos, datos laborales y traducciones.' },
  tareas: { title: 'Tareas', subtitle: 'Seguimiento por fase, estado, prioridad y vencimiento.' },
  coordinacion: { title: 'Coordinación', subtitle: 'Reuniones con Dirección, otras áreas y seguimiento histórico por sindicato.' },
  comite: { title: 'Comité / Paritaria', subtitle: 'Gestión unificada de sesiones, puntos y clasificación por órgano.' },
  actas: { title: 'Actas', subtitle: 'Actas de Comité y Paritaria, estados y alegaciones sindicales.' },
  huelgas: { title: 'Huelgas', subtitle: 'Convocatorias, personal con turno y seguimiento de jornadas de huelga.' },
  paritaria: { title: 'Comisión Paritaria', subtitle: 'Sesiones, puntos del orden del día y tareas tratadas.' },
  'criterios-rrll': { title: 'Criterios RRLL', subtitle: 'Criterios internos, consultas y referencias de aplicación.' },
  teletrabajo: { title: 'Teletrabajo', subtitle: 'Solicitudes, validaciones, campañas y documentación asociada.' },
  'ayuda-escolar': { title: 'Ayuda escolar', subtitle: 'Recepción, identificación y archivo de documentación recibida por correo.' },
  'ticket-restaurante': { title: 'Ticket Restaurante', subtitle: 'Calendarios, ausencias, cálculo mensual y cotización.' },
  presupuestos: { title: 'Presupuestos RRLL', subtitle: 'Escenarios presupuestarios, simulación anual y comparativa con reales.' },
  'licencias-sin-sueldo': { title: 'Licencias sin sueldo', subtitle: 'Permisos no retribuidos por aprobación, firma, vigencia e histórico.' },
  sorteos: { title: 'Sorteos', subtitle: 'Creación de sorteos, exclusiones e histórico de resultados.' },
  loteria: { title: 'Lotería', subtitle: 'Campaña anual, solicitudes de décimos, cobros y control de caja.' },
  vinculograma: { title: 'Vinculograma', subtitle: 'Vinculaciones vigentes e histórico entre personas y áreas.' },
  especiales: { title: 'Especiales', subtitle: 'Comunicaciones, eventos y borradores de correo operativo.' },
  ajustes: { title: 'Ajustes', subtitle: 'Configuración de persistencia, datos y parámetros de la aplicación.' },
};

const getFallbackUserName = () => {
  if (typeof window === 'undefined') return 'Usuario local';
  return readStorageItem('traccion.header.username') ?? 'Usuario local';
};

type HeaderSyncVisual = {
  label: string;
  dotClass: string;
  textClass: string;
};

function buildHeaderSyncVisual(
  databaseReady: boolean,
  syncStatus: ReturnType<typeof useExternalDataSyncStatus>,
  connectivity: ReturnType<typeof useDatabaseConnectivityState>,
): HeaderSyncVisual {
  if (connectivity.phase === 'reconnecting') {
    return {
      label: 'Reconectando…',
      dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_0_4px_rgba(251,191,36,0.10),0_0_14px_rgba(251,191,36,0.32)]',
      textClass: 'text-amber-100',
    };
  }
  if (connectivity.phase === 'syncing') {
    return { label: 'Actualizando…', dotClass: 'bg-sky-400 animate-pulse', textClass: 'text-sky-100' };
  }
  if (connectivity.phase === 'recovered') {
    return { label: 'Reconectado', dotClass: 'bg-emerald-400', textClass: 'text-emerald-200' };
  }
  if (!databaseReady) {
    return { label: 'Edición bloqueada', dotClass: 'bg-orange-400', textClass: 'text-orange-200' };
  }
  if (syncStatus.status === 'error') {
    return { label: 'Error de sync', dotClass: 'bg-red-500', textClass: 'text-red-200' };
  }
  if (syncStatus.status === 'checking') {
    return {
      label: 'Sincronizando…',
      dotClass: 'bg-amber-400 animate-pulse shadow-[0_0_0_4px_rgba(251,191,36,0.10),0_0_14px_rgba(251,191,36,0.32)]',
      textClass: 'text-amber-100',
    };
  }
  return { label: 'Actualizado', dotClass: 'bg-emerald-400', textClass: 'text-emerald-200' };
}

function formatBreadcrumbLabel(value: string): string {
  return value.replace(/\s*›\s*/g, ' / ').toLocaleUpperCase('es');
}

function getUserInitials(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return 'UL';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toLocaleUpperCase('es');
  return cleaned.slice(0, 2).toLocaleUpperCase('es');
}

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (target: { view: AppView; recordId?: string; responsibleFilter?: string }) => void;
}) {
  const [windowsUserName, setWindowsUserName] = useState(getFallbackUserName);
  const headerCopy = useMemo(() => viewHeaderCopy[activeView], [activeView]);
  const breadcrumb = useMemo(() => formatBreadcrumbLabel(getNavigationBreadcrumb(activeView)), [activeView]);
  const ModuleIcon = useMemo(() => getNavigationIcon(activeView), [activeView]);
  const moduleHelp = useModuleHelpRegistry((state) => state.content);
  const dbStatus = useDatabaseStatus();
  const syncStatus = useExternalDataSyncStatus();
  const connectivity = useDatabaseConnectivityState();
  const syncVisual = buildHeaderSyncVisual(Boolean(dbStatus?.ready), syncStatus, connectivity);
  const userInitials = useMemo(() => getUserInitials(windowsUserName), [windowsUserName]);

  useEffect(() => subscribeToAppNavigation(onViewChange), [onViewChange]);

  useEffect(() => {
    let isMounted = true;
    window.traccion
      ?.getWindowsUser?.()
      .then((userName) => {
        const normalizedUserName = userName?.trim() || 'Usuario local';
        if (!isMounted) return;
        setWindowsUserName(normalizedUserName);
        writeStorageItem('traccion.header.username', normalizedUserName);
      })
      .catch(() => {
        if (isMounted) setWindowsUserName('Usuario local');
      });
    return () => { isMounted = false; };
  }, []);

  return (
    <header className="relative z-40 px-1 pt-1 sm:px-1.5 sm:pt-1.5">
      <div className="relative grid min-w-0 gap-2 overflow-visible rounded-[15px] border border-white/10 bg-gradient-to-r from-[#071322] via-metro-topbar to-[#091424] px-2.5 py-1.5 shadow-[0_14px_28px_rgba(2,6,23,0.22)] lg:min-h-[50px] lg:grid-cols-[minmax(0,1fr)_minmax(270px,360px)_auto] lg:items-center lg:gap-3 lg:px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-metro-red/35 bg-metro-red/10 text-metro-red shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <ModuleIcon aria-hidden="true" size={17} strokeWidth={2.1} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-[9px] font-extrabold uppercase tracking-[0.145em] text-sky-100/80">{breadcrumb}</p>
              {moduleHelp ? (
                <ModuleHelpButton title={moduleHelp.title} subtitle={moduleHelp.subtitle} sections={moduleHelp.sections} />
              ) : null}
            </div>
            <h1 className="mt-0.5 truncate text-[1.12rem] font-black leading-none tracking-tight text-metro-text">{headerCopy.title}</h1>
          </div>
        </div>

        <div className="min-w-0 lg:justify-self-end lg:w-full lg:max-w-[22rem] xl:max-w-[24rem]">
          <GlobalSearch onNavigate={onViewChange} />
        </div>

        <div className="flex min-w-0 items-center gap-1.5 lg:justify-end">
          <TaskNotificationsBell windowsUserName={windowsUserName} onViewChange={onViewChange} />

          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-2 py-1 shadow-sm shadow-slate-950/15 lg:min-w-[180px]">
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1E3650] text-[12px] font-black tracking-[0.02em] text-sky-100 ring-1 ring-white/8">{userInitials}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold leading-tight text-metro-text" title={windowsUserName}>{windowsUserName}</p>
              <div className={`mt-0.5 flex min-w-0 items-center gap-1.5 text-[9px] font-semibold ${syncVisual.textClass}`} title={connectivity.phase === 'connected' ? syncStatus.message : connectivity.message}>
                {connectivity.phase === 'reconnecting' ? (
                  <WifiOff className="shrink-0 animate-pulse" size={12} aria-hidden="true" />
                ) : connectivity.phase === 'syncing' ? (
                  <RefreshCw className="shrink-0 animate-spin" size={12} aria-hidden="true" />
                ) : connectivity.phase === 'recovered' ? (
                  <CheckCircle2 className="shrink-0" size={12} aria-hidden="true" />
                ) : (
                  <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${syncVisual.dotClass}`} />
                )}
                <span className="truncate">{syncVisual.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
