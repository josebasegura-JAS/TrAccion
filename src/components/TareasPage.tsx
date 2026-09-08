import { ChevronDown, ChevronRight, Settings, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ModuleHelpSection } from './ModuleHelp';
import { ActionButton } from './ui/ActionButton';
import { PageHeader } from './ui/PageHeader';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { filterTasks } from '../features/tareas/domain/filters';
import { StatusBadge } from './ui/StatusBadge';
import { CountBadge } from './ui/CountBadge';
import {
  sortTasksByDefault,
  type TaskSortKey,
} from '../features/tareas/domain/sort';
import {
  isTaskClosed,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type Task,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { FilterSelect } from './ui/FilterSelect';
import { SearchField } from './ui/SearchField';
import { Toolbar } from './ui/Toolbar';
import type { ExportColumn } from '../shared/export/types';
import { reorderExportColumns } from '../shared/export/reorderExportColumns';
import { ExportPrintButtons } from '../shared/print/ExportPrintButtons';
import { DataTable, type DataTableColumn } from '../shared/table/DataTable';
import { relativeDate } from '../utils/relativeDate';
import { sortDataTableRows } from '../shared/table/tableSorting';
import {
  type TableViewPreferences,
  useTableViewPreferences,
} from '../shared/table/useTableViewPreferences';
import { TaskEditor } from './TaskEditor';
import { useAppDialog } from '../hooks/useAppDialog';
import { TaskOriginsModal } from '../features/tareas/components/TaskOriginsModal';
import {
  DEFAULT_HISTORIC_PAGE_SIZE,
  HistoricYearSection,
  groupHistoricTasks,
  type HistoricSortKey,
  type HistoricSortState,
} from '../features/tareas/components/TareasHistoricSection';

type ActiveTaskTableColumnId = TaskSortKey | 'actions';

const TAREAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Para qué sirve',
    body: 'Centraliza tareas internas y solicitudes sindicales para seguirlas por tipo, fase, prioridad, responsable y fecha límite, con seguimiento de gestión y documentos enlazados.',
  },
  {
    title: 'Tipo, fase y estado de cada tarea',
    items: [
      'Tipo: interna o sindical.',
      'Estado: pendiente, en curso, bloqueada, resuelta o cerrada.',
      'Fase: clasifica la tarea y determina en qué módulo aparece como "punto" disponible. Las fases "comité" y "paritaria" son las que alimentan, respectivamente, los módulos Comité y Paritaria; se gestionan desde Configuración → Fases de tareas.',
      'Una tarea se considera cerrada tanto si su estado es "cerrada" como si su fase es "cerrada"; en ambos casos deja de estar disponible para añadirla a una sesión de Comité o Paritaria.',
    ],
  },
  {
    title: 'Orígenes',
    items: [
      'Los orígenes (sindicatos, áreas internas u otros) se gestionan desde el propio módulo Tareas, no desde Configuración: se pueden dar de alta, editar, activar/desactivar o eliminar.',
      'Sirven para clasificar de dónde viene cada tarea o solicitud, independientemente de su fase.',
    ],
  },
  {
    title: 'Seguimiento y documentos',
    items: [
      'Cada tarea admite un histórico de anotaciones de seguimiento con fecha y hora, para dejar constancia de las gestiones realizadas.',
      'Se pueden enlazar documentos (nombre + ruta) relacionados con la tarea.',
      'Si una tarea nace de una sesión de Comité o Paritaria, conserva la referencia a esa sesión para poder rastrear su origen.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Dar de alta cada asunto indicando tipo, fase, prioridad y responsable.',
      'Añadir seguimiento, documentos y cambios de estado a medida que avance el caso.',
      'Filtrar y ordenar la tabla para revisar primero lo urgente o lo próximo a vencer.',
      'Cerrar la tarea cuando quede resuelta para que deje de aparecer como pendiente en los módulos que consumen esos puntos.',
    ],
  },
];

const PRIORITY_ORDER = new Map(TASK_PRIORITIES.map((priority, index) => [priority, index]));

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
  columnOrder: null,
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

export function TareasPage({
  initialTaskId = null,
  navigationNonce,
}: {
  initialTaskId?: string | null;
  navigationNonce?: number;
} = {}) {
  const {
    filters,
    historicalTasksLoaded,
    isLoadingHistoricalTasks,
    load,
    loadHistoricalTasks,
    removeWithConcurrencyCheck,
    selectTask,
    setFilter,
    tasks,
  } = useTaskStore();
  const { alert, dialogNode } = useAppDialog();
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

  useEffect(() => {
    if (isHistoricOpen) {
      void loadHistoricalTasks();
    }
  }, [isHistoricOpen, loadHistoricalTasks]);

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
    () => (isHistoricOpen && historicalTasksLoaded ? groupHistoricTasks(historicTasks) : []),
    [historicTasks, historicalTasksLoaded, isHistoricOpen],
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

  const { preferences, setSort, setColumnWidth, setColumnOrder, resetColumnWidths } =
    useTableViewPreferences<ActiveTaskTableColumnId>({
      storageKey: TAREAS_TABLE_STORAGE_KEY,
      defaultPreferences: defaultTareasTablePreferences,
      validColumnIds: tareasTableColumnIds,
    });

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
          <ActionButton
            onClick={(event) => {
              event.stopPropagation();
              void (async () => {
                const result = await removeWithConcurrencyCheck(task.id, task.updatedAt);
                if (!result.ok) {
                  await alert(result.message, { type: 'error' });
                }
              })();
            }}
            size="sm"
            variant="delete"
          />
        ),
        width: 88,
        minWidth: 82,
        maxWidth: 120,
        resizable: false,
        isActionColumn: true,
        className: 'whitespace-nowrap',
      },
    ],
    [alert, removeWithConcurrencyCheck],
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
      className="space-y-3"
      id="tareas"
    >
      <PageHeader
        actions={
          <Toolbar
            filters={
              <>
                <SearchField
                  onChange={(event) => setFilter('search', event.target.value)}
                  onClear={() => setFilter('search', '')}
                  placeholder="Buscar..."
                  value={filters.search}
                  wrapperClassName="min-w-[220px]"
                />
                <FilterSelect
                  allLabel="Todos los tipos"
                  aria-label="Filtrar tareas por tipo"
                  onChange={(event) => setFilter('tipo', event.target.value as typeof filters.tipo)}
                  options={TASK_TYPES}
                  value={filters.tipo}
                  wrapperClassName="w-[96px]"
                />
                <FilterSelect
                  allLabel="Todas las fases"
                  aria-label="Filtrar tareas por fase"
                  onChange={(event) => setFilter('fase', event.target.value)}
                  options={phaseFilterOptions}
                  value={filters.fase}
                  wrapperClassName="w-[104px]"
                />
                <FilterSelect
                  allLabel="Todos los estados"
                  aria-label="Filtrar tareas por estado"
                  onChange={(event) => setFilter('estado', event.target.value as typeof filters.estado)}
                  options={TASK_STATES.filter((estado) => estado !== 'cerrada')}
                  value={filters.estado}
                  wrapperClassName="w-[104px]"
                />
                <FilterSelect
                  allLabel="Todas las prioridades"
                  aria-label="Filtrar tareas por prioridad"
                  onChange={(event) =>
                    setFilter('prioridad', event.target.value as typeof filters.prioridad)
                  }
                  options={TASK_PRIORITIES}
                  value={filters.prioridad}
                  wrapperClassName="w-[116px]"
                />
                <FilterSelect
                  allLabel="Todos los orígenes"
                  aria-label="Filtrar tareas por origen"
                  onChange={(event) => setFilter('origen', event.target.value)}
                  options={originFilterOptions}
                  value={filters.origen}
                  wrapperClassName="w-[120px]"
                />
              </>
            }
            actions={
              <>
                <ActionButton
                  icon={Settings}
                  iconOnly={false}
                  onClick={() => setIsOriginsModalOpen(true)}
                  size="sm"
                  variant="secondary"
                >
                  Orígenes
                </ActionButton>
                <ActionButton iconOnly={false} onClick={openCreateEditor} size="sm" variant="add">
                  Nueva tarea
                </ActionButton>
              </>
            }
          />
        }
        helpSections={TAREAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del centro operativo, prioridades, fases, orígenes e histórico."
        status={<InlineSaveFeedback />}
        title="Tareas"
      />

      <div className="overflow-hidden rounded-xl border border-metro-border">
        <div className="flex items-center justify-between border-b border-metro-border bg-metro-surface px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-metro-red" /> Tareas activas
            <CountBadge>{filteredTasks.length} registros</CountBadge>
          </div>
          <ExportPrintButtons
            payload={{
              title: 'Tareas activas',
              filename: 'tareas-activas',
              columns: reorderExportColumns(taskExportColumns, preferences.columnOrder),
              rows: sortedTasks,
              filterLabel: activeTasksFilterLabel,
            }}
          />
        </div>
        {activeFilterChips.length > 0 && (
          <div className="border-b border-metro-border bg-metro-panel px-3 py-2">
            <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
          </div>
        )}
        <DataTable
          ariaLabel="Tareas activas"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={activeTaskColumns}
          emptyMessage="No hay tareas activas con los filtros aplicados."
          getRowId={(task) => task.id}
          maxHeightClassName="max-h-[460px]"
          onColumnOrderChange={setColumnOrder}
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
          <CountBadge>
            {historicalTasksLoaded ? historicTasks.length : 'Sin cargar'} registros
          </CountBadge>
        </button>
        {isHistoricOpen && (
          <div className="bg-metro-surface">
            {isLoadingHistoricalTasks && (
              <p className="px-3 py-3 text-sm text-metro-muted">Cargando histórico…</p>
            )}
            {!isLoadingHistoricalTasks && historicalTasksLoaded && historicGroups.length === 0 && (
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
      {dialogNode}
    </section>
  );
}
