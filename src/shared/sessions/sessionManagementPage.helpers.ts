import type { Task } from '../../features/tareas/domain/task';
import { buildFilterLabel } from '../export/filterLabel';
import type { ExportColumn, ExportTablePayload } from '../export/types';
import { sanitizeFilenamePart } from '../export/tableExport';
import { managedSessionLabel, type ManagedSession, type SessionModuleConfig } from './session';

export const sessionExportColumns: ExportColumn<ManagedSession>[] = [
  {
    key: 'status',
    header: 'Estado',
    value: (session) => (session.status === 'closed' ? 'Cerrada' : 'Abierta'),
  },
  { key: 'code', header: 'Código', value: (session) => session.code },
  { key: 'date', header: 'Fecha', value: (session) => session.date || null },
  { key: 'title', header: 'Título', value: (session) => session.title },
  { key: 'notes', header: 'Notas', value: (session) => session.notes || null },
  { key: 'items', header: 'Puntos', value: (session) => session.items.length },
  { key: 'closedAt', header: 'Cerrada', value: (session) => session.closedAt || null },
];

export type SessionPointRow = {
  order: number;
  title: string;
  status: string;
  origin: string;
  union: string;
  responsible: string;
  dueDate: string;
  description: string;
};

export const sessionPointExportColumns: ExportColumn<SessionPointRow>[] = [
  { key: 'order', header: 'Orden', value: (row) => row.order },
  { key: 'title', header: 'Punto / tarea', value: (row) => row.title },
  { key: 'status', header: 'Situación', value: (row) => row.status },
  { key: 'origin', header: 'Origen', value: (row) => row.origin || null },
  { key: 'union', header: 'Sindicato', value: (row) => row.union || null },
  { key: 'responsible', header: 'Responsable', value: (row) => row.responsible || null },
  { key: 'dueDate', header: 'Fecha límite', value: (row) => row.dueDate || null },
  { key: 'description', header: 'Descripción', value: (row) => row.description || null },
];

export function sortOpenSessions(sessions: ManagedSession[]): ManagedSession[] {
  return [...sessions].sort(
    (first, second) =>
      String(first.date || '').localeCompare(String(second.date || '')) ||
      String(first.code || '').localeCompare(String(second.code || ''), 'es', {
        numeric: true,
        sensitivity: 'base',
      }),
  );
}

function normalizeSessionSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSessionSearchHaystack(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
): string {
  const taskValues = session.items.flatMap((taskId) => {
    const task = tasksById.get(taskId);
    if (!task) {
      return [taskId];
    }

    return [
      task.id,
      task.titulo,
      task.descripcion,
      task.observaciones,
      task.origen,
      task.sindicato,
      task.responsable,
      task.estado,
      task.prioridad,
      task.fechaLimite,
      task.mail,
      ...task.documentLinks.flatMap((link) => [link.nombre, link.ruta]),
      ...task.seguimiento.map((entry) => `${entry.fechaHora} ${entry.texto}`),
    ];
  });

  return normalizeSessionSearch(
    [
      config.title,
      config.shortTitle,
      session.id,
      session.code,
      session.date,
      session.title,
      session.notes,
      session.status,
      session.closedAt ?? '',
      ...session.treatedTaskIds,
      ...session.untreatedTaskIds,
      ...taskValues,
    ].join(' '),
  );
}

export function matchesSessionSearch(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
  search: string,
): boolean {
  const terms = normalizeSessionSearch(search).split(' ').filter(Boolean);
  if (terms.length === 0) {
    return true;
  }

  const haystack = getSessionSearchHaystack(session, tasksById, config);
  return terms.every((term) => haystack.includes(term));
}

function getSessionHistoryYear(session: ManagedSession): string {
  const year = session.date.match(/^(\d{4})/)?.[1];
  return year ?? 'Sin año';
}

export function groupClosedSessionsByYear(
  sessions: ManagedSession[],
): Array<{ year: string; sessions: ManagedSession[] }> {
  const groups = new Map<string, ManagedSession[]>();

  sessions.forEach((session) => {
    const year = getSessionHistoryYear(session);
    groups.set(year, [...(groups.get(year) ?? []), session]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, yearSessions]) => ({
      year,
      sessions: yearSessions.sort(
        (first, second) =>
          String(second.date || '').localeCompare(String(first.date || '')) ||
          String(second.code || '').localeCompare(String(first.code || ''), 'es', {
            numeric: true,
            sensitivity: 'base',
          }),
      ),
    }));
}

export function getTaskTitle(tasksById: Map<string, Task>, taskId: string): string {
  return tasksById.get(taskId)?.titulo ?? 'Tarea no encontrada';
}

export function describeTask(task: Task | undefined): string {
  if (!task) {
    return 'La tarea ya no existe o fue eliminada.';
  }

  return [
    task.origen ? `Origen: ${task.origen}` : '',
    task.sindicato ? `Sindicato: ${task.sindicato}` : '',
    task.responsable ? `Responsable: ${task.responsable}` : '',
    task.fechaLimite ? `Límite: ${task.fechaLimite}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function getTaskDescription(task: Task | undefined): string {
  if (!task) {
    return 'La tarea ya no existe o fue eliminada.';
  }

  return task.descripcion || task.observaciones || '';
}

function getSessionPointStatus(session: ManagedSession, taskId: string): string {
  if (session.status === 'open') {
    return 'Pendiente de tratar';
  }

  if (session.treatedTaskIds.includes(taskId)) {
    return 'Tratada';
  }

  if (session.untreatedTaskIds.includes(taskId)) {
    return 'No tratada';
  }

  return 'Sin clasificar';
}

function buildSessionPointRows(
  session: ManagedSession,
  tasksById: Map<string, Task>,
): SessionPointRow[] {
  return session.items.map((taskId, index) => {
    const task = tasksById.get(taskId);

    return {
      order: index + 1,
      title: getTaskTitle(tasksById, taskId),
      status: getSessionPointStatus(session, taskId),
      origin: task?.origen ?? '',
      union: task?.sindicato ?? '',
      responsible: task?.responsable ?? '',
      dueDate: task?.fechaLimite ?? '',
      description: getTaskDescription(task),
    };
  });
}

export function buildSessionExportPayload(
  session: ManagedSession,
  tasksById: Map<string, Task>,
  config: SessionModuleConfig,
): ExportTablePayload<SessionPointRow> {
  const label = managedSessionLabel(session);
  const filenameParts = [config.moduleId, session.date, session.code, session.title]
    .map((part) => sanitizeFilenamePart(part))
    .filter(Boolean)
    .join('-');
  const filterLabel = buildFilterLabel([
    ['Sesión', label],
    ['Título', session.title],
    ['Estado', session.status === 'closed' ? 'Cerrada' : 'Abierta'],
    ['Notas', session.notes],
  ]);

  return {
    title: `${config.title} · ${label}`,
    filename: filenameParts || `${config.moduleId}-sesion`,
    columns: sessionPointExportColumns,
    rows: buildSessionPointRows(session, tasksById),
    filterLabel,
  };
}
