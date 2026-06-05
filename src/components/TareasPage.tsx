import { ChevronDown, ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { filterTasks } from '../features/tareas/domain/filters';
import {
  sortTasksByColumn,
  sortTasksByDefault,
  type SortDirection,
  type TaskSortKey,
} from '../features/tareas/domain/sort';
import {
  TASK_PRIORITIES,
  TASK_STATES,
  type Task,
  type TaskPriority,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { TaskEditor } from './TaskEditor';

interface SortState {
  key: TaskSortKey;
  direction: SortDirection;
}

type HistoricSortKey = 'titulo' | 'closedAt' | 'responsable' | 'prioridad';

interface HistoricSortState {
  key: HistoricSortKey;
  direction: SortDirection;
}

interface HistoricYearGroup {
  year: string;
  tasks: Task[];
}

const sortableColumns: Array<{ key: TaskSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[220px]' },
  { key: 'estado', label: 'Estado', className: 'w-[115px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[105px]' },
  { key: 'fechaLimite', label: 'Fecha límite', className: 'w-[120px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[150px]' },
  { key: 'origenSindicato', label: 'Origen sindicato', className: 'w-[155px]' },
];

const historicColumns: Array<{ key: HistoricSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[320px]' },
  { key: 'closedAt', label: 'Fecha cierre', className: 'w-[150px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[190px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[120px]' },
];

function formatDateTime(value: string | null): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getClosedYear(task: Task): string {
  const closedDate = task.closedAt ? new Date(task.closedAt) : null;
  return closedDate && !Number.isNaN(closedDate.getTime())
    ? String(closedDate.getFullYear())
    : 'Sin fecha';
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

function sortHistoricTasks(tasks: Task[], sortState: HistoricSortState): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((first, second) => {
      const comparison = compareHistoricTasks(first.task, second.task, sortState.key);
      const orderedComparison = sortState.direction === 'asc' ? comparison : -comparison;
      return orderedComparison || first.index - second.index;
    })
    .map(({ task }) => task);
}

function groupHistoricTasks(tasks: Task[], sortState: HistoricSortState): HistoricYearGroup[] {
  const groups = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const year = getClosedYear(task);
    groups.set(year, [...(groups.get(year) ?? []), task]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupTasks]) => ({ year, tasks: sortHistoricTasks(groupTasks, sortState) }));
}

export function TareasPage() {
  const { filters, load, selectTask, setFilter, tasks } = useTaskStore();
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [sortState, setSortState] = useState<SortState | null>(null);
  const [historicSortState, setHistoricSortState] = useState<HistoricSortState>({
    key: 'closedAt',
    direction: 'desc',
  });
  const [isHistoricOpen, setIsHistoricOpen] = useState(false);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, [load]);

  const visibleTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [filters, tasks]);
  const sortedTasks = useMemo(() => {
    if (!sortState) {
      return sortTasksByDefault(filteredTasks);
    }

    return sortTasksByColumn(filteredTasks, sortState.key, sortState.direction);
  }, [filteredTasks, sortState]);
  const historicTasks = useMemo(
    () => visibleTasks.filter((task) => task.estado === 'cerrada'),
    [visibleTasks],
  );
  const historicGroups = useMemo(
    () => groupHistoricTasks(historicTasks, historicSortState),
    [historicTasks, historicSortState],
  );

  const editorTask =
    editorMode === 'edit' ? (visibleTasks.find((task) => task.id === editingTaskId) ?? null) : null;

  const openEditor = (task: Task) => {
    selectTask(task.id);
    setEditingTaskId(task.id);
    setEditorMode('edit');
  };

  const openCreateEditor = () => {
    setEditingTaskId(null);
    setEditorMode('create');
  };

  const closeEditor = () => {
    setEditorMode(null);
    setEditingTaskId(null);
  };

  const toggleSort = (key: TaskSortKey) => {
    setSortState((current) => ({
      key,
      direction: current?.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleHistoricSort = (key: HistoricSortKey) => {
    setHistoricSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleHistoricYear = (year: string) => {
    setOpenYears((current) => ({ ...current, [year]: !current[year] }));
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-white p-4 shadow-card"
      id="tareas"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <h2 className="text-2xl font-bold text-metro-text">Tareas</h2>
          <p className="mt-0.5 text-base text-metro-muted">
            Listado de tareas con alta manual, edición, borrado lógico, búsqueda y filtros.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva tarea
          </button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(150px,0.8fr)_minmax(150px,0.8fr)]">
        <label className="flex items-center gap-2 rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-muted">
          <Search size={16} />
          <input
            className="w-full bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder="Buscar por título o descripción..."
            type="search"
            value={filters.search}
          />
        </label>
        <SelectFilter
          label="Estado"
          onChange={(value) => setFilter('estado', value as typeof filters.estado)}
          options={TASK_STATES.filter((estado) => estado !== 'cerrada')}
          value={filters.estado}
        />
        <SelectFilter
          label="Prioridad"
          onChange={(value) => setFilter('prioridad', value as typeof filters.prioridad)}
          options={TASK_PRIORITIES}
          value={filters.prioridad}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Tareas
          </div>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {filteredTasks.length} registros
          </span>
        </div>
        <div className="max-h-[460px] overflow-auto">
          <table className="min-w-[970px] table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                {sortableColumns.map((column) => {
                  const isActive = sortState?.key === column.key;

                  return (
                    <th className={`${column.className} px-3 py-2`} key={column.key}>
                      <button
                        className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                        onClick={() => toggleSort(column.key)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        {isActive && <span>{sortState.direction === 'asc' ? '↑' : '↓'}</span>}
                      </button>
                    </th>
                  );
                })}
                <th className="w-[100px] px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-metro-border bg-white">
              {sortedTasks.map((task) => (
                <tr
                  className="cursor-pointer hover:bg-red-50/50"
                  key={task.id}
                  onClick={() => openEditor(task)}
                >
                  <td
                    className="truncate px-3 py-1.5 font-semibold text-metro-text"
                    title={task.titulo}
                  >
                    {task.titulo}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={task.estado}>
                    {task.estado}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={task.prioridad}>
                    {task.prioridad}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={task.fechaLimite || '—'}
                  >
                    {task.fechaLimite || '—'}
                  </td>
                  <td className="truncate px-3 py-1.5 text-metro-muted" title={task.responsable}>
                    {task.responsable}
                  </td>
                  <td
                    className="truncate px-3 py-1.5 text-metro-muted"
                    title={task.origenSindicato}
                  >
                    {task.origenSindicato}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button
                      className="rounded-lg bg-metro-red px-2.5 py-1 text-xs font-semibold text-white hover:bg-metro-dark"
                      onClick={(event) => {
                        event.stopPropagation();
                        openEditor(task);
                      }}
                      type="button"
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-metro-border">
        <button
          className="flex w-full items-center justify-between border-b border-metro-border bg-white px-3 py-2 text-left"
          onClick={() => setIsHistoricOpen((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            {isHistoricOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Histórico
          </span>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-metro-dark">
            {historicTasks.length} registros
          </span>
        </button>
        {isHistoricOpen && (
          <div className="bg-white">
            {historicGroups.length === 0 && (
              <p className="px-3 py-3 text-sm text-metro-muted">No hay tareas cerradas.</p>
            )}
            {historicGroups.map((group) => {
              const isYearOpen = openYears[group.year] ?? false;

              return (
                <div className="border-b border-metro-border last:border-b-0" key={group.year}>
                  <button
                    className="flex w-full items-center gap-2 bg-[#F9FAFB] px-3 py-2 text-left text-sm font-bold text-metro-text hover:bg-red-50/50"
                    onClick={() => toggleHistoricYear(group.year)}
                    type="button"
                  >
                    {isYearOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    {group.year} ({group.tasks.length})
                  </button>
                  {isYearOpen && (
                    <div className="max-h-[320px] overflow-auto">
                      <table className="min-w-[780px] table-fixed text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-[#F9FAFB] text-[11px] uppercase tracking-wide text-metro-muted">
                          <tr>
                            {historicColumns.map((column) => {
                              const isActive = historicSortState.key === column.key;

                              return (
                                <th className={`${column.className} px-3 py-2`} key={column.key}>
                                  <button
                                    className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
                                    onClick={() => toggleHistoricSort(column.key)}
                                    type="button"
                                  >
                                    <span>{column.label}</span>
                                    {isActive && (
                                      <span>
                                        {historicSortState.direction === 'asc' ? '↑' : '↓'}
                                      </span>
                                    )}
                                  </button>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-metro-border bg-white">
                          {group.tasks.map((task) => (
                            <tr
                              className="cursor-pointer hover:bg-red-50/50"
                              key={task.id}
                              onClick={() => openEditor(task)}
                            >
                              <td
                                className="truncate px-3 py-1.5 font-semibold text-metro-text"
                                title={task.titulo}
                              >
                                {task.titulo}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={formatDateTime(task.closedAt)}
                              >
                                {formatDateTime(task.closedAt)}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={task.responsable}
                              >
                                {task.responsable}
                              </td>
                              <td
                                className="truncate px-3 py-1.5 text-metro-muted"
                                title={task.prioridad}
                              >
                                {task.prioridad}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editorMode && <TaskEditor mode={editorMode} onDone={closeEditor} task={editorTask} />}
    </section>
  );
}

function SelectFilter({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="rounded-lg border border-metro-border bg-white px-3 py-1.5 text-sm text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
