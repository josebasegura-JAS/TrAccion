import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { CompactTable, CompactTableBody, CompactTableHead } from '../../../shared/table/CompactTable';
import { getTaskClosedYear } from '../domain/historico';
import { TASK_PRIORITIES, type Task, type TaskPriority } from '../domain/task';
import type { SortDirection } from '../domain/sort';

export type HistoricSortKey = 'titulo' | 'closedAt' | 'responsable' | 'prioridad';

export interface HistoricSortState {
  key: HistoricSortKey;
  direction: SortDirection;
}

export interface HistoricYearGroup {
  year: string;
  tasks: Task[];
}

export const HISTORIC_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
export const DEFAULT_HISTORIC_PAGE_SIZE = 50;

const historicColumns: Array<{ key: HistoricSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[320px]' },
  { key: 'closedAt', label: 'Fecha cierre', className: 'w-[150px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[190px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[120px]' },
];

function formatDateTime(value: string | null): string {
  if (!value) return '—';

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

const PRIORITY_ORDER = new Map<TaskPriority, number>(
  TASK_PRIORITIES.map((priority, index) => [priority, index]),
);

function compareHistoricTasks(first: Task, second: Task, key: HistoricSortKey): number {
  if (key === 'closedAt') {
    return (first.closedAt ?? '').localeCompare(second.closedAt ?? '', 'es', {
      numeric: true,
      sensitivity: 'base',
    });
  }

  if (key === 'prioridad') {
    return (
      (PRIORITY_ORDER.get(first.prioridad) ?? TASK_PRIORITIES.length) -
      (PRIORITY_ORDER.get(second.prioridad) ?? TASK_PRIORITIES.length)
    );
  }

  return first[key].localeCompare(second[key], 'es', { numeric: true, sensitivity: 'base' });
}

export function sortHistoricTasks(tasks: Task[], sortState: HistoricSortState): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((first, second) => {
      const comparison = compareHistoricTasks(first.task, second.task, sortState.key);
      const orderedComparison = sortState.direction === 'asc' ? comparison : -comparison;
      return orderedComparison || first.index - second.index;
    })
    .map(({ task }) => task);
}

export function groupHistoricTasks(tasks: Task[]): HistoricYearGroup[] {
  const groups = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const year = getTaskClosedYear(task);
    const yearTasks = groups.get(year);
    if (yearTasks) yearTasks.push(task);
    else groups.set(year, [task]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupTasks]) => ({ year, tasks: groupTasks }));
}

export function HistoricYearSection({
  group,
  isOpen,
  onOpenChange,
  onOpenTask,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  page,
  pageSize,
  sortState,
}: {
  group: HistoricYearGroup;
  isOpen: boolean;
  onOpenChange: (year: string) => void;
  onOpenTask: (task: Task) => void;
  onPageChange: (year: string, page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (key: HistoricSortKey) => void;
  page: number;
  pageSize: number;
  sortState: HistoricSortState;
}) {
  const sortedTasks = useMemo(() => (isOpen ? sortHistoricTasks(group.tasks, sortState) : []), [
    group.tasks,
    isOpen,
    sortState,
  ]);

  const totalPages = Math.max(1, Math.ceil(group.tasks.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const firstRow = (safePage - 1) * pageSize;
  const visibleTasks = sortedTasks.slice(firstRow, firstRow + pageSize);
  const firstVisible = group.tasks.length === 0 ? 0 : firstRow + 1;
  const lastVisible = Math.min(firstRow + pageSize, group.tasks.length);

  return (
    <div className="border-b border-metro-border last:border-b-0">
      <button
        className="flex w-full items-center gap-2 bg-metro-panel px-3 py-2 text-left text-sm font-bold text-metro-text hover:bg-metro-red/10"
        onClick={() => onOpenChange(group.year)}
        type="button"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        {group.year} ({group.tasks.length})
      </button>
      {isOpen && (
        <div className="border-t border-metro-border bg-metro-surface">
          <div className="flex flex-col gap-2 border-b border-metro-border px-3 py-2 text-xs text-metro-muted md:flex-row md:items-center md:justify-between">
            <span>
              Mostrando {firstVisible}-{lastVisible} de {group.tasks.length}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                Mostrar
                <select
                  className="rounded-lg border border-metro-border bg-metro-panel px-2 py-1 text-metro-text outline-none"
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  value={pageSize}
                >
                  {HISTORIC_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="rounded-lg border border-metro-border px-2 py-1 font-semibold text-metro-text disabled:cursor-not-allowed disabled:opacity-45"
                disabled={safePage <= 1}
                onClick={() => onPageChange(group.year, safePage - 1)}
                type="button"
              >
                ← Anterior
              </button>
              <span className="font-semibold text-metro-text">
                Página {safePage} de {totalPages}
              </span>
              <button
                className="rounded-lg border border-metro-border px-2 py-1 font-semibold text-metro-text disabled:cursor-not-allowed disabled:opacity-45"
                disabled={safePage >= totalPages}
                onClick={() => onPageChange(group.year, safePage + 1)}
                type="button"
              >
                Siguiente →
              </button>
            </div>
          </div>
          <div className="max-h-[320px] overflow-auto">
            <CompactTable className="table-fixed">
              <CompactTableHead>
                <tr>
                  {historicColumns.map((column) => {
                    const isActive = sortState.key === column.key;
                    return (
                      <th className={`${column.className} px-3 py-2`} key={column.key}>
                        <button
                          className="flex w-full items-center gap-1 text-left font-semibold hover:text-metro-text"
                          onClick={() => onSortChange(column.key)}
                          type="button"
                        >
                          <span>{column.label}</span>
                          {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </CompactTableHead>
              <CompactTableBody>
                {visibleTasks.map((task) => (
                  <tr
                    className="cursor-pointer hover:bg-metro-red/10"
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                  >
                    <td className="truncate px-3 py-1.5 font-semibold text-metro-text" title={task.titulo}>
                      {task.titulo}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={formatDateTime(task.closedAt)}>
                      {formatDateTime(task.closedAt)}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={task.responsable}>
                      {task.responsable || '—'}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={task.prioridad}>
                      {task.prioridad}
                    </td>
                  </tr>
                ))}
              </CompactTableBody>
            </CompactTable>
          </div>
        </div>
      )}
    </div>
  );
}
