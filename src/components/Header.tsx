import { useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import type { AppView } from './Sidebar';
import { GlobalSearch } from './GlobalSearch';

const traccionLogoSrc = '../assets/logo/traccion-logo.png';

const viewHeaderCopy: Record<AppView, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Inicio',
    subtitle: 'Resumen operativo de RRLL, agenda y prioridades del día.',
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
    title: 'Comité de Empresa',
    subtitle: 'Sesiones, puntos del orden del día y tareas tratadas.',
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
  sorteos: {
    title: 'Sorteos',
    subtitle: 'Creación de sorteos, exclusiones e histórico de resultados.',
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

  return window.localStorage.getItem('traccion.header.username') ?? 'Usuario local';
};

export function Header({
  activeView,
  onViewChange,
}: {
  activeView: AppView;
  onViewChange: (view: AppView) => void;
}) {
  const [windowsUserName, setWindowsUserName] = useState(getFallbackUserName);
  const headerCopy = useMemo(() => viewHeaderCopy[activeView], [activeView]);

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
        window.localStorage.setItem('traccion.header.username', normalizedUserName);
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
    <header className="flex h-[72px] items-center justify-between border-b border-metro-border bg-metro-topbar/95 px-6 shadow-sm shadow-slate-950/20">
      <div className="flex min-w-0 items-center gap-4">
        <img alt="TrAccion" className="h-10 w-auto flex-none object-contain" src={traccionLogoSrc} />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-metro-text">
            {headerCopy.title}
          </h1>
          <p className="truncate text-xs text-metro-muted">{headerCopy.subtitle}</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-4">
        <GlobalSearch onNavigate={onViewChange} />

        <div className="flex items-center gap-3 rounded-2xl border border-metro-border bg-metro-panel/70 px-3 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-metro-red/15 text-metro-red ring-1 ring-metro-red/20">
            <UserRound size={18} />
          </div>
          <div className="hidden min-w-0 sm:block">
            <p className="text-[11px] uppercase tracking-[0.18em] text-metro-muted">Usuario</p>
            <p className="max-w-[11rem] truncate text-sm font-semibold text-metro-text">
              {windowsUserName}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
