import {
  CalendarDays,
  FileText,
  Landmark,
  ClipboardList,
  Gift,
  Laptop,
  Link2,
  MailPlus,
  ShieldCheck,
  Utensils,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export type AppView =
  | 'dashboard'
  | 'plantilla'
  | 'tareas'
  | 'comite'
  | 'actas'
  | 'paritaria'
  | 'criterios-rrll'
  | 'teletrabajo'
  | 'ticket-restaurante'
  | 'presupuestos'
  | 'licencias-sin-sueldo'
  | 'sorteos'
  | 'vinculograma'
  | 'especiales'
  | 'ajustes';

export type NavigationGroupId = 'personas' | 'herramientas' | 'operativa';

type NavigationItem = {
  label: string;
  icon: LucideIcon;
  view?: AppView;
  disabled?: boolean;
};

export type NavigationGroup = {
  id: NavigationGroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'operativa',
    label: 'Operativa diaria',
    description: 'Seguimiento diario del trabajo operativo.',
    icon: ClipboardList,
    items: [
      { label: 'Tareas', icon: ClipboardList, view: 'tareas' },
      { label: 'Comité / Paritaria', icon: CalendarDays, view: 'comite' },
      { label: 'Actas', icon: FileText, view: 'actas' },
    ],
  },
  {
    id: 'personas',
    label: 'Personas',
    description: 'Gestión de plantilla, teletrabajo y vinculaciones.',
    icon: UsersRound,
    items: [
      { label: 'Plantilla', icon: UsersRound, view: 'plantilla' },
      { label: 'Teletrabajo', icon: Laptop, view: 'teletrabajo' },
      { label: 'Licencias sin sueldo', icon: CalendarDays, view: 'licencias-sin-sueldo' },
      { label: 'Vinculograma', icon: Link2, view: 'vinculograma' },
    ],
  },
  {
    id: 'herramientas',
    label: 'Herramientas',
    description: 'Utilidades de cálculo, criterios, sorteos y comunicaciones especiales.',
    icon: Gift,
    items: [
      { label: 'Ticket Restaurante', icon: Utensils, view: 'ticket-restaurante' },
      { label: 'Presupuestos', icon: Landmark, view: 'presupuestos' },
      { label: 'Criterios RRLL', icon: ShieldCheck, view: 'criterios-rrll' },
      { label: 'Sorteos', icon: Gift, view: 'sorteos' },
      { label: 'Especiales', icon: MailPlus, view: 'especiales' },
    ],
  },
];

export const getGroupForView = (view: AppView): NavigationGroupId | null => {
  if (view === 'paritaria') {
    return 'operativa';
  }

  if (view === 'dashboard' || view === 'ajustes') {
    return null;
  }

  const group = navigationGroups.find((navigationGroup) =>
    navigationGroup.items.some((item) => item.view === view),
  );

  return group?.id ?? null;
};

export const getNavigationBreadcrumb = (view: AppView): string => {
  if (view === 'dashboard') {
    return 'Inicio';
  }

  if (view === 'ajustes') {
    return 'Sistema › Ajustes';
  }

  if (view === 'paritaria') {
    return 'Operativa diaria › Comité / Paritaria';
  }

  const group = navigationGroups.find((navigationGroup) =>
    navigationGroup.items.some((item) => item.view === view),
  );
  const item = group?.items.find((navigationItem) => navigationItem.view === view);

  return group && item ? `${group.label} › ${item.label}` : 'TrAccion';
};
