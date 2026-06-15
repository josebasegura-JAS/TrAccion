import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ModuleHelpButton, type ModuleHelpSection } from './ModuleHelp';
import type { TaskOriginConfig } from '../features/configuracion/domain/taskOrigins';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { filterTasks } from '../features/tareas/domain/filters';
import { getTaskClosedYear } from '../features/tareas/domain/historico';
import {
  sortTasksByDefault,
  type SortDirection,
  type TaskSortKey,
} from '../features/tareas/domain/sort';
import {
  isTaskClosed,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
  type TaskPriority,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { SelectFilter } from '../shared/filters/SelectFilter';
import type { ExportColumn } from '../shared/export/types';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { relativeDate } from '../utils/relativeDate';
import { DeleteConfirmDialog } from './ui/DeleteConfirmDialog';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../shared/table/useTableViewPreferences';
import { TaskEditor } from './TaskEditor';

type ActiveTaskTableColumnId = TaskSortKey | 'actions';

const TAREAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    items: [
      'Centraliza tareas internas y solicitudes sindicales para seguirlas por fase, prioridad y fecha límite.',
      'Permite separar trabajo abierto, cerrado e histórico sin sacar los asuntos del circuito de RRLL.',
      'Los orígenes configurables sirven para clasificar de dónde viene cada tarea o petición.',
    ],
  },
  {
    title: 'Uso recomendado',
    items: [
      'Registra cada asunto con prioridad, origen, fase y vencimiento cuando aplique.',
      'Usa búsqueda, filtros y ordenación para revisar primero lo crítico o lo próximo a vencer.',
      'En edición multiusuario, respeta el aviso de bloqueo para evitar pisar cambios de otra persona.',
    ],
  },
];

type HistoricSortKey = 'titulo' | 'closedAt' | 'responsable' | 'prioridad';

interface HistoricSortState {
  key: HistoricSortKey;
  direction: SortDirection;
}

interface HistoricYearGroup {
  year: string;
  tasks: Task[];
}

const HISTORIC_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
const DEFAULT_HISTORIC_PAGE_SIZE = 50;

const historicColumns: Array<{ key: HistoricSortKey; label: string; className: string }> = [
  { key: 'titulo', label: 'Título', className: 'w-[320px]' },
  { key: 'closedAt', label: 'Fecha cierre', className: 'w-[150px]' },
  { key: 'responsable', label: 'Responsable', className: 'w-[190px]' },
  { key: 'prioridad', label: 'Prioridad', className: 'w-[120px]' },
];

const TAREAS_TABLE_STORAGE_KEY = 'traccion.tableView.tareas.active';

const defaultTareasTablePreferences: TableViewPreferences<ActiveTaskTableColumnId> = {
  sort: null,
  columnWidths: {
    titulo: 230,
    tipo: 100,
    fase: 130,
    estado: 120,
    prioridad: 105,
    fechaLimite: 120,
    responsable: 150,
    sindicato: 145,
    actions: 88,
  },
};

const tareasTableColumnIds: ActiveTaskTableColumnId[] = [
  'titulo',
  'tipo',
  'fase',
  'estado',
  'prioridad',
  'fechaLimite',
  'responsable',
  'sindicato',
  'actions',
];

const taskExportColumns: ExportColumn<Task>[] = [
  { key: 'titulo', header: 'Título', value: (task) => task.titulo },
  { key: 'tipo', header: 'Tipo', value: (task) => task.tipo },
  { key: 'fase', header: 'Fase', value: (task) => task.fase },
  { key: 'estado', header: 'Estado', value: (task) => task.estado },
  { key: 'prioridad', header: 'Prioridad', value: (task) => task.prioridad },
  { key: 'fechaLimite', header: 'Fecha límite', value: (task) => task.fechaLimite || null },
  { key: 'responsable', header: 'Responsable', value: (task) => task.responsable || null },
  { key: 'sindicato', header: 'Origen', value: (task) => task.sindicato || null },
  {
    key: 'sessionDocumentCode',
    header: 'Código sesión',
    value: (task) => task.sessionDocumentCode || null,
  },
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

function groupHistoricTasks(tasks: Task[]): HistoricYearGroup[] {
  const groups = new Map<string, Task[]>();

  tasks.forEach((task) => {
    const year = getTaskClosedYear(task);
    const yearTasks = groups.get(year);

    if (yearTasks) {
      yearTasks.push(task);
      return;
    }

    groups.set(year, [task]);
  });

  return Array.from(groups.entries())
    .sort(([firstYear], [secondYear]) =>
      secondYear.localeCompare(firstYear, 'es', { numeric: true }),
    )
    .map(([year, groupTasks]) => ({ year, tasks: groupTasks }));
}


function HistoricYearSection({
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
  const sortedTasks = useMemo(() => {
    if (!isOpen) {
      return [];
    }

    return sortHistoricTasks(group.tasks, sortState);
  }, [group.tasks, isOpen, sortState]);

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
            <table className="w-full table-fixed text-left text-xs">
              <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
                <tr>
                  {historicColumns.map((column) => {
                    const isActive = sortState.key === column.key;

                    return (
                      <th className={`${column.className} px-3 py-2`} key={column.key}>
                        <button
                          className="flex w-full items-center gap-1 text-left font-bold uppercase tracking-wide hover:text-metro-text"
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
              </thead>
              <tbody className="bg-metro-surface [&>tr:nth-child(even)]:bg-metro-panel/45 [&>tr:hover]:bg-metro-red/10">
                {visibleTasks.map((task) => (
                  <tr className="cursor-pointer" key={task.id} onClick={() => onOpenTask(task)}>
                    <td className="truncate px-3 py-1.5 font-semibold text-metro-text" title={task.titulo}>
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
                      {task.responsable || '—'}
                    </td>
                    <td className="truncate px-3 py-1.5 text-metro-muted" title={task.prioridad}>
                      {task.prioridad}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export function TareasPage({
  initialTaskId = null,
  navigationNonce,
}: {
  initialTaskId?: string | null;
  navigationNonce?: number;
} = {}) {
  const { filters, load, remove, selectTask, setFilter, tasks } = useTaskStore();
  const taskPhases = useConfiguracionStore((state) => state.taskPhases);
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const [editorMode, setEditorMode] = useState<'create' | 'edit' | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [historicSortState, setHistoricSortState] = useState<HistoricSortState>({
    key: 'closedAt',
    direction: 'desc',
  });
  const [isHistoricOpen, setIsHistoricOpen] = useState(false);
  const [openYears, setOpenYears] = useState<Record<string, boolean>>({});
  const [historicPages, setHistoricPages] = useState<Record<string, number>>({});
  const [historicPageSize, setHistoricPageSize] = useState<number>(DEFAULT_HISTORIC_PAGE_SIZE);
  const [isOriginsModalOpen, setIsOriginsModalOpen] = useState(false);
  const processedNavigationNonceRef = useRef<number | null>(null);

  useEffect(() => {
    load();
    loadConfiguracion();
  }, [load, loadConfiguracion]);

  const phaseFilterOptions = useMemo(
    () => taskPhases.filter((phase) => phase.active).map((phase) => phase.nombre),
    [taskPhases],
  );
  const originFilterOptions = useMemo(
    () =>
      taskOrigins
        .filter((origin) => origin.active && !origin.deletedAt)
        .map((origin) => origin.nombre)
        .sort((first, second) => first.localeCompare(second, 'es', { sensitivity: 'base' })),
    [taskOrigins],
  );
  const visibleTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
  const filteredTasks = useMemo(() => filterTasks(tasks, filters), [filters, tasks]);
  const historicTasks = useMemo(
    () => visibleTasks.filter((task) => isTaskClosed(task)),
    [visibleTasks],
  );
  const historicGroups = useMemo(
    () => (isHistoricOpen ? groupHistoricTasks(historicTasks) : []),
    [historicTasks, isHistoricOpen],
  );
  const activeTasksFilterLabel = buildFilterLabel([
    ['Búsqueda', filters.search],
    ['Tipo', filters.tipo],
    ['Fase', filters.fase],
    ['Estado', filters.estado],
    ['Prioridad', filters.prioridad],
    ['Origen', filters.origen],
  ]);
  const activeFilterChips: ActiveFilterChip[] = [
    filters.search.trim()
      ? {
          key: 'search',
          label: 'Búsqueda',
          value: filters.search.trim(),
          onClear: () => setFilter('search', ''),
        }
      : null,
    filters.tipo
      ? { key: 'tipo', label: 'Tipo', value: filters.tipo, onClear: () => setFilter('tipo', '') }
      : null,
    filters.fase
      ? { key: 'fase', label: 'Fase', value: filters.fase, onClear: () => setFilter('fase', '') }
      : null,
    filters.estado
      ? {
          key: 'estado',
          label: 'Estado',
          value: filters.estado,
          onClear: () => setFilter('estado', ''),
        }
      : null,
    filters.prioridad
      ? {
          key: 'prioridad',
          label: 'Prioridad',
          value: filters.prioridad,
          onClear: () => setFilter('prioridad', ''),
        }
      : null,
    filters.origen
      ? {
          key: 'origen',
          label: 'Origen',
          value: filters.origen,
          onClear: () => setFilter('origen', ''),
        }
      : null,
  ].filter((filter): filter is ActiveFilterChip => filter !== null);

  const clearActiveFilters = () => {
    setFilter('search', '');
    setFilter('tipo', '');
    setFilter('fase', '');
    setFilter('estado', '');
    setFilter('prioridad', '');
    setFilter('origen', '');
  };

  const { preferences, setSort, setColumnWidth, resetColumnWidths } = useTableViewPreferences<ActiveTaskTableColumnId>(
    {
      storageKey: TAREAS_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTareasTablePreferences,
      validColumnIds: tareasTableColumnIds,
    },
  );

  const activeTaskRows = useMemo(
    () => (preferences.sort ? filteredTasks : sortTasksByDefault(filteredTasks)),
    [filteredTasks, preferences.sort],
  );

  const activeTaskColumns = useMemo<Array<DataTableColumn<Task, ActiveTaskTableColumnId>>>(
    () => [
      {
        id: 'titulo',
        header: 'Título',
        accessor: (task) => task.titulo,
        render: (task) => task.titulo,
        width: 230,
        minWidth: 170,
        maxWidth: 460,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'tipo',
        header: 'Tipo',
        accessor: (task) => task.tipo,
        render: (task) => task.tipo,
        width: 100,
        minWidth: 82,
        maxWidth: 170,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'fase',
        header: 'Fase',
        accessor: (task) => task.fase,
        render: (task) => task.fase,
        width: 130,
        minWidth: 100,
        maxWidth: 230,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'estado',
        header: 'Estado',
        accessor: (task) => task.estado,
        render: (task) => task.estado,
        width: 120,
        minWidth: 95,
        maxWidth: 180,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'prioridad',
        header: 'Prioridad',
        accessor: (task) => PRIORITY_ORDER.get(task.prioridad) ?? TASK_PRIORITIES.length,
        render: (task) => task.prioridad,
        width: 105,
        minWidth: 90,
        maxWidth: 165,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'fechaLimite',
        header: 'Fecha límite',
        accessor: (task) => task.fechaLimite,
        render: (task) => {
          if (!task.fechaLimite) {
            return '—';
          }
          const relative = relativeDate(task.fechaLimite);
          return (
            <span title={task.fechaLimite}>
              {task.fechaLimite}
              {relative && <span className="ml-1.5 text-xs text-metro-muted">{relative}</span>}
            </span>
          );
        },
        width: 120,
        minWidth: 105,
        maxWidth: 180,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'responsable',
        header: 'Responsable',
        accessor: (task) => task.responsable,
        render: (task) => task.responsable || '—',
        width: 150,
        minWidth: 110,
        maxWidth: 260,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'sindicato',
        header: 'Origen',
        accessor: (task) => task.sindicato,
        render: (task) => task.sindicato || '—',
        width: 145,
        minWidth: 95,
        maxWidth: 220,
        sortable: true,
        className: 'text-metro-muted',
      },
      {
        id: 'actions',
        header: 'Acción',
        render: (task) => (
          <button
            className="rounded-lg border border-metro-border px-2 py-1 font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={(event) => {
              event.stopPropagation();
              remove(task.id);
            }}
            type="button"
          >
            Eliminar
          </button>
        ),
        width: 88,
        minWidth: 82,
        maxWidth: 120,
        resizable: false,
        isActionColumn: true,
        className: 'whitespace-nowrap',
      },
    ],
    [remove],
  );

  const sortedTasks = useMemo(
    () => sortDataTableRows(activeTaskRows, activeTaskColumns, preferences.sort),
    [activeTaskColumns, activeTaskRows, preferences.sort],
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

  useEffect(() => {
    if (!initialTaskId || navigationNonce === undefined) {
      return;
    }

    if (processedNavigationNonceRef.current === navigationNonce) {
      return;
    }

    const targetTask = visibleTasks.find((task) => task.id === initialTaskId);
    if (!targetTask) {
      return;
    }

    selectTask(targetTask.id);
    setEditingTaskId(targetTask.id);
    setEditorMode('edit');
    processedNavigationNonceRef.current = navigationNonce;
  }, [initialTaskId, navigationNonce, selectTask, visibleTasks]);

  const toggleHistoricSort = (key: HistoricSortKey) => {
    setHistoricSortState((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
    setHistoricPages({});
  };

  const toggleHistoricYear = (year: string) => {
    setOpenYears((current) => ({ ...current, [year]: !current[year] }));
  };

  const setHistoricPage = (year: string, page: number) => {
    setHistoricPages((current) => ({ ...current, [year]: page }));
  };

  const updateHistoricPageSize = (pageSize: number) => {
    setHistoricPageSize(pageSize);
    setHistoricPages({});
  };

  return (
    <section
      className="rounded-2xl border border-metro-border bg-metro-surface p-4 shadow-card"
      id="tareas"
    >
      <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-metro-red">Módulo</p>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-metro-text">Tareas</h2>
            <ModuleHelpButton
              title="Tareas"
              subtitle="Guía rápida del centro operativo, prioridades, fases, orígenes e histórico."
              sections={TAREAS_HELP_SECTIONS}
            />
          </div>
          <p className="mt-0.5 text-base text-metro-muted">
            Centro operativo único para tareas internas y solicitudes sindicales por fase.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-xl border border-metro-border bg-metro-surface px-3 py-2 text-sm font-semibold text-metro-text hover:border-metro-red"
            onClick={() => setIsOriginsModalOpen(true)}
            type="button"
          >
            <Settings size={16} /> Orígenes
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark"
            onClick={openCreateEditor}
            type="button"
          >
            <Plus size={16} /> Nueva tarea
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex flex-col gap-2 border-b border-metro-border bg-metro-surface px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Tareas activas
            <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
              {filteredTasks.length} registros
            </span>
            <ExportPrintButtons
              payload={{
                title: 'Tareas activas',
                filename: 'tareas-activas',
                columns: taskExportColumns,
                rows: sortedTasks,
                filterLabel: activeTasksFilterLabel,
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 overflow-x-auto pb-1 xl:pb-0">
            <label className="flex h-9 w-[170px] shrink-0 items-center gap-2 rounded-lg border border-metro-border bg-metro-panel px-2.5 text-sm text-metro-muted">
              <Search size={15} className="shrink-0" />
              <input
                className="min-w-0 flex-1 bg-transparent text-metro-text outline-none placeholder:text-metro-muted"
                onChange={(event) => setFilter('search', event.target.value)}
                placeholder="Buscar..."
                type="search"
                value={filters.search}
              />
            </label>
            <SelectFilter
              className="h-9 w-[104px] shrink-0 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
              label="Tipo"
              onChange={(value) => setFilter('tipo', value as typeof filters.tipo)}
              options={TASK_TYPES}
              value={filters.tipo}
            />
            <SelectFilter
              className="h-9 w-[112px] shrink-0 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
              label="Fase"
              onChange={(value) => setFilter('fase', value)}
              options={phaseFilterOptions}
              value={filters.fase}
            />
            <SelectFilter
              className="h-9 w-[112px] shrink-0 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
              label="Estado"
              onChange={(value) => setFilter('estado', value as typeof filters.estado)}
              options={TASK_STATES.filter((estado) => estado !== 'cerrada')}
              value={filters.estado}
            />
            <SelectFilter
              className="h-9 w-[116px] shrink-0 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
              label="Prioridad"
              onChange={(value) => setFilter('prioridad', value as typeof filters.prioridad)}
              options={TASK_PRIORITIES}
              value={filters.prioridad}
            />
            <SelectFilter
              className="h-9 w-[132px] shrink-0 rounded-lg border border-metro-border bg-metro-surface px-2.5 text-sm text-metro-text outline-none focus:border-metro-red"
              label="Origen"
              onChange={(value) => setFilter('origen', value)}
              options={originFilterOptions}
              value={filters.origen}
            />
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="border-b border-metro-border bg-metro-panel px-3 py-2">
            <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
          </div>
        )}
        <DataTable
          ariaLabel="Tareas activas"
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={activeTaskColumns}
          emptyMessage="No hay tareas activas con los filtros aplicados."
          getRowId={(task) => task.id}
          maxHeightClassName="max-h-[460px]"
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          onSortChange={setSort}
          rows={activeTaskRows}
          sort={preferences.sort}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-metro-border">
        <button
          className="flex w-full items-center justify-between border-b border-metro-border bg-metro-surface px-3 py-2 text-left"
          onClick={() => setIsHistoricOpen((current) => !current)}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-metro-text">
            {isHistoricOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Histórico
          </span>
          <span className="rounded-full bg-metro-red/10 px-3 py-1 text-xs font-bold text-red-200">
            {historicTasks.length} registros
          </span>
        </button>
        {isHistoricOpen && (
          <div className="bg-metro-surface">
            {historicGroups.length === 0 && (
              <p className="px-3 py-3 text-sm text-metro-muted">No hay tareas cerradas.</p>
            )}
            {historicGroups.map((group) => (
              <HistoricYearSection
                group={group}
                isOpen={openYears[group.year] ?? false}
                key={group.year}
                onOpenChange={toggleHistoricYear}
                onOpenTask={openEditor}
                onPageChange={setHistoricPage}
                onPageSizeChange={updateHistoricPageSize}
                onSortChange={toggleHistoricSort}
                page={historicPages[group.year] ?? 1}
                pageSize={historicPageSize}
                sortState={historicSortState}
              />
            ))}
          </div>
        )}
      </div>

      {isOriginsModalOpen && <TaskOriginsModal onClose={() => setIsOriginsModalOpen(false)} />}
      {editorMode && <TaskEditor mode={editorMode} onDone={closeEditor} task={editorTask} />}
    </section>
  );
}

function TaskOriginsModal({ onClose }: { onClose: () => void }) {
  const taskOrigins = useConfiguracionStore((state) => state.taskOrigins);
  const addTaskOrigin = useConfiguracionStore((state) => state.addTaskOrigin);
  const updateTaskOrigin = useConfiguracionStore((state) => state.updateTaskOrigin);
  const toggleTaskOrigin = useConfiguracionStore((state) => state.toggleTaskOrigin);
  const deleteTaskOrigin = useConfiguracionStore((state) => state.deleteTaskOrigin);
  const [newOriginName, setNewOriginName] = useState('');
  const [newOriginType, setNewOriginType] = useState<TaskOriginConfig['tipo']>('sindicato');

  const sortedOrigins = useMemo(
    () =>
      taskOrigins
        .filter((origin) => !origin.deletedAt)
        .sort((first, second) => first.nombre.localeCompare(second.nombre, 'es')),
    [taskOrigins],
  );

  const submitNewOrigin = () => {
    if (!newOriginName.trim()) {
      return;
    }

    addTaskOrigin(newOriginName, newOriginType);
    setNewOriginName('');
    setNewOriginType('sindicato');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <aside
        aria-modal="true"
        className="flex max-h-[calc(100vh-2rem)] w-[min(760px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-metro-border bg-metro-panel p-3 shadow-2xl"
        role="dialog"
      >
        <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-metro-border bg-metro-surface px-3 py-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-metro-red">
              Mantenimiento
            </p>
            <h3 className="mt-1 text-base font-bold text-metro-text">Orígenes de tareas</h3>
            <p className="text-xs text-metro-muted">
              Alta, edición y activación de sindicatos, áreas internas u otros orígenes.
            </p>
          </div>
          <button
            aria-label="Cerrar mantenimiento de orígenes"
            className="rounded-lg border border-metro-border bg-metro-surface p-2 text-metro-muted hover:border-metro-red hover:text-metro-text"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3 grid gap-2 rounded-xl border border-metro-border bg-metro-surface p-3 md:grid-cols-[minmax(220px,1fr)_160px_110px]">
          <input
            className="rounded-lg border border-metro-border bg-metro-panel px-3 py-2 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
            onChange={(event) => setNewOriginName(event.target.value)}
            placeholder="Nuevo origen"
            type="text"
            value={newOriginName}
          />
          <OriginTypeSelect onChange={setNewOriginType} value={newOriginType} />
          <button
            className="rounded-lg bg-metro-red px-3 py-2 text-sm font-semibold text-white hover:bg-metro-dark disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!newOriginName.trim()}
            onClick={submitNewOrigin}
            type="button"
          >
            Añadir
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-metro-border">
          <table className="w-full table-fixed text-left text-xs">
            <thead className="sticky top-0 z-10 bg-metro-panel text-[11px] uppercase tracking-wide text-metro-muted">
              <tr>
                <th className="w-[38%] px-3 py-2">Nombre</th>
                <th className="w-[24%] px-3 py-2">Tipo</th>
                <th className="w-[16%] px-3 py-2">Estado</th>
                <th className="w-[26%] px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-metro-surface [&>tr:nth-child(even)]:bg-metro-panel/45">
              {sortedOrigins.map((origin) => (
                <TaskOriginRow
                  key={origin.id}
                  origin={origin}
                  onDelete={deleteTaskOrigin}
                  onToggle={toggleTaskOrigin}
                  onUpdate={updateTaskOrigin}
                />
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}

function TaskOriginRow({
  origin,
  onDelete,
  onToggle,
  onUpdate,
}: {
  origin: TaskOriginConfig;
  onDelete: (id: string) => void;
  onToggle: (id: string) => void;
  onUpdate: (id: string, nombre: string, tipo: TaskOriginConfig['tipo']) => void;
}) {
  const [name, setName] = useState(origin.nombre);
  const [type, setType] = useState<TaskOriginConfig['tipo']>(origin.tipo);
  const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
  const hasChanges = name.trim() !== origin.nombre || type !== origin.tipo;

  const handleDelete = () => {
    setIsDeleteConfirmVisible(true);
  };

  const confirmDelete = () => {
    onDelete(origin.id);
    setIsDeleteConfirmVisible(false);
  };

  useEffect(() => {
    setName(origin.nombre);
    setType(origin.tipo);
  }, [origin.nombre, origin.tipo]);

  return (
    <>
      {isDeleteConfirmVisible && (
        <tr>
          <td className="px-3 py-2" colSpan={4}>
            <DeleteConfirmDialog
              label={`el origen «${origin.nombre}»`}
              onCancel={() => setIsDeleteConfirmVisible(false)}
              onConfirm={confirmDelete}
            />
          </td>
        </tr>
      )}
      <tr className="align-top">
      <td className="px-3 py-2">
        <input
          className="w-full rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
          onChange={(event) => setName(event.target.value)}
          value={name}
        />
      </td>
      <td className="px-3 py-2">
        <OriginTypeSelect onChange={setType} value={type} />
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full px-2 py-1 text-xs font-bold ${
            origin.active
              ? 'bg-emerald-500/15 text-emerald-100'
              : 'bg-slate-500/20 text-metro-muted'
          }`}
        >
          {origin.active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-2">
        <button
          className="rounded-lg border border-metro-border px-2 py-1 font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasChanges || !name.trim()}
          onClick={() => onUpdate(origin.id, name, type)}
          type="button"
        >
          Guardar
        </button>
        <button
          className="rounded-lg border border-metro-border px-2 py-1 font-semibold text-metro-muted hover:border-metro-red hover:text-metro-text"
          onClick={() => onToggle(origin.id)}
          type="button"
        >
          {origin.active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          className="rounded-lg border border-red-500/40 px-2 py-1 font-semibold text-red-200 hover:border-red-400 hover:text-white"
          onClick={handleDelete}
          type="button"
        >
          Eliminar
        </button>
        </div>
      </td>
      </tr>
    </>
  );
}

function OriginTypeSelect({
  value,
  onChange,
}: {
  value: TaskOriginConfig['tipo'];
  onChange: (value: TaskOriginConfig['tipo']) => void;
}) {
  return (
    <select
      className="w-full rounded-lg border border-metro-border bg-metro-panel px-2 py-1.5 text-sm font-medium text-metro-text outline-none focus:border-metro-red"
      onChange={(event) => onChange(event.target.value as TaskOriginConfig['tipo'])}
      value={value}
    >
      <option value="sindicato">Sindicato</option>
      <option value="empresa">Empresa</option>
      <option value="otro">Otro</option>
    </select>
  );
}
