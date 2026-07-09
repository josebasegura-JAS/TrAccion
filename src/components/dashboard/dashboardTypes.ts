import type { LucideIcon } from 'lucide-react';
import type { AppView } from '../../navigation/navigation';

export type CalendarEventType = 'task' | 'committee' | 'paritaria' | 'telework' | 'tickets' | 'actas';

export type DashboardPopupItem = {
  id: string;
  date?: string;
  type: CalendarEventType;
  title: string;
  detail: string;
  view: AppView;
  recordId?: string;
};

export type CalendarEvent = DashboardPopupItem & {
  date: string;
};

export type DashboardPopup = {
  eyebrow: string;
  title: string;
  subtitle?: string;
  emptyText: string;
  items: DashboardPopupItem[];
};

export type DashboardNavigationTarget = {
  view: AppView;
  recordId?: string;
};

export type KpiCard = {
  title: string;
  value: number | string;
  subtitle: string;
  helper: string;
  icon: LucideIcon;
  tone: string;
  segments: { label: string; value: number; className: string }[];
};
