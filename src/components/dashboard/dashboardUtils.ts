import type { Task, TaskState } from '../../features/tareas/domain/task';
import type { CalendarEventType } from './dashboardTypes';

export const eventTone: Record<CalendarEventType, string> = {
  task: 'bg-red-500',
  committee: 'bg-orange-500',
  paritaria: 'bg-violet-500',
  telework: 'bg-blue-500',
  tickets: 'bg-emerald-500',
  actas: 'bg-amber-400',
};

export const taskStateLabels: Record<TaskState, string> = {
  pendiente: 'Abiertas',
  'en curso': 'En curso',
  bloqueada: 'Bloqueadas',
  resuelta: 'Resueltas',
  cerrada: 'Cerradas',
};

export const taskStateBars: Record<TaskState, string> = {
  pendiente: 'bg-red-500',
  'en curso': 'bg-orange-500',
  bloqueada: 'bg-violet-500',
  resuelta: 'bg-emerald-500',
  cerrada: 'bg-slate-400',
};

export const monthFormatter = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
export const fullDateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const shortDateFormatter = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' });

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDisplayDate(value: string): string {
  const date = parseIsoDate(value);
  return date ? shortDateFormatter.format(date) : 'Sin fecha';
}

export function getMonthMatrix(monthDate: Date): (Date | null)[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    cells.push(null);
  }

  return cells;
}

export function getLatestTeletrabajoPeriodo(solicitudes: readonly { periodo: string }[]): string {
  return Array.from(
    new Set(solicitudes.map((solicitud) => solicitud.periodo.trim()).filter(Boolean)),
  ).sort((first, second) =>
    second.localeCompare(first, 'es', { numeric: true, sensitivity: 'base' }),
  )[0] ?? '';
}

function groupByState(tasks: readonly Task[]): Record<TaskState, number> {
  return tasks.reduce<Record<TaskState, number>>(
    (accumulator, task) => {
      accumulator[task.estado] += 1;
      return accumulator;
    },
    { pendiente: 0, 'en curso': 0, bloqueada: 0, resuelta: 0, cerrada: 0 },
  );
}

export function stateSegmentsFromTasks(tasks: readonly Task[]) {
  const byState = groupByState(tasks);
  return Object.entries(byState).map(([state, value]) => ({
    label: taskStateLabels[state as TaskState],
    value,
    className: taskStateBars[state as TaskState],
  }));
}

export function miniDonutStyle(segments: { value: number; className: string }[]) {
  const colors: Record<string, string> = {
    'bg-red-500': '#ef4444',
    'bg-orange-500': '#f97316',
    'bg-violet-500': '#8b5cf6',
    'bg-emerald-500': '#10b981',
    'bg-blue-500': '#3b82f6',
    'bg-slate-400': '#94a3b8',
    'bg-amber-400': '#fbbf24',
  };
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return { background: 'conic-gradient(#e2e8f0 0deg 360deg)' };
  }

  let cursor = 0;
  const stops = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const start = cursor;
      const end = cursor + (segment.value / total) * 360;
      cursor = end;
      return `${colors[segment.className] ?? '#64748b'} ${start}deg ${end}deg`;
    })
    .join(', ');

  return { background: `conic-gradient(${stops})` };
}
