import { AlertTriangle, CalendarClock, ChevronDown, ChevronRight, Clock3, FileSpreadsheet, ListChecks, PlayCircle, Settings, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ModuleHelpSection } from './ModuleHelp';
import { ActionButton } from './ui/ActionButton';
import { PageHeader } from './ui/PageHeader';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { filterTasks } from '../features/tareas/domain/filters';
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
import { HistoricYearSection } from '../features/tareas/components/TareasHistoricSection';
import {
  DEFAULT_HISTORIC_PAGE_SIZE,
  groupHistoricTasks,
  type HistoricSortKey,
  type HistoricSortState,
} from '../features/tareas/components/tareasHistoricUtils';

type ActiveTaskTableColumnId = TaskSortKey | 'createdAt' | 'actions';

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

const TASK_STATE_LABELS: Record<Task['estado'], string> = {
  pendiente: 'Pendiente',
  'en curso': 'En curso',
  bloqueada: 'Bloqueada',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
};

const TASK_STATE_PILL: Record<Task['estado'], string> = {
  pendiente: 'border-amber-400/40 bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.04)]',
  'en curso': 'border-sky-400/40 bg-sky-400/10 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.04)]',
  bloqueada: 'border-rose-400/40 bg-rose-400/10 text-rose-200 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.04)]',
  resuelta: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.04)]',
  cerrada: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
};

const TASK_STATE_DOT: Record<Task['estado'], string> = {
  pendiente: 'bg-amber-400',
  'en curso': 'bg-sky-400',
  bloqueada: 'bg-rose-400',
  resuelta: 'bg-emerald-400',
  cerrada: 'bg-slate-400',
};

const TASK_PRIORITY_LABELS: Record<Task['prioridad'], string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const TASK_PRIORITY_DOT: Record<Task['prioridad'], string> = {
  critica: 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.35)]',
  alta: 'bg-red-400',
  media: 'bg-amber-400',
  baja: 'bg-emerald-400',
};

function TaskSummaryCard({
  icon: Icon,
  value,
  label,
  detail,
  tone,
}: {
  icon: typeof ListChecks;
  value: number;
  label: string;
  detail: string;
  tone: 'blue' | 'amber' | 'cyan' | 'rose' | 'red';
}) {
  const toneMap = {
    blue: {
      card: 'border-sky-400/20 bg-[linear-gradient(135deg,rgba(30,64,175,0.16),rgba(14,34,57,0.9))]',
      icon: 'border-sky-400/15 bg-sky-400/10 text-sky-300',
      label: 'text-sky-300',
    },
    amber: {
      card: 'border-amber-400/20 bg-[linear-gradient(135deg,rgba(217,119,6,0.10),rgba(14,34,57,0.9))]',
      icon: 'border-amber-400/15 bg-amber-400/10 text-amber-300',
      label: 'text-amber-300',
    },
    cyan: {
      card: 'border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.10),rgba(14,34,57,0.9))]',
      icon: 'border-cyan-400/15 bg-cyan-400/10 text-cyan-300',
      label: 'text-cyan-300',
    },
    rose: {
      card: 'border-rose-400/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.11),rgba(14,34,57,0.9))]',
      icon: 'border-rose-400/15 bg-rose-400/10 text-rose-300',
      label: 'text-rose-300',
    },
    red: {
      card: 'border-red-400/20 bg-[linear-gradient(135deg,rgba(239,68,68,0.10),rgba(14,34,57,0.9))]',
      icon: 'border-red-400/15 bg-red-400/10 text-red-300',
      label: 'text-red-300',
    },
  }[tone];

  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_8px_20px_rgba(2,6,23,0.18)] ${toneMap.card}`}>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${toneMap.icon}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-black leading-none text-metro-text">{value}</span>
        <span className={`mt-1 block truncate text-sm font-extrabold ${toneMap.label}`}>{label}</span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-metro-muted">{detail}</span>
      </span>
    </div>
  );
}

const TAREAS_TABLE_STORAGE_KEY = 'traccion.tableView.tareas.active.v2';

const defaultTareasTablePreferences: TableViewPreferences<ActiveTaskTableColumnId> = {
  sort: null,
  columnWidths: {
    createdAt: 115,
    titulo: 230,
    tipo: 100,
    fase: 130,
    estado: 120,
    prioridad: 105,
    fechaLimite: 120,
    sindicato: 145,
    actions: 88,
  },
  columnOrder: null,
};

const tareasTableColumnIds: ActiveTaskTableColumnId[] = [
  'createdAt',
  'titulo',
  'tipo',
  'fase',
  'estado',
  'prioridad',
  'fechaLimite',
  'sindicato',
  'actions',
];

const taskExportColumns: ExportColumn<Task>[] = [
  { key: 'createdAt', header: 'Fecha creación', value: (task) => task.createdAt.slice(0, 10) },
  { key: 'titulo', header: 'Título', value: (task) => task.titulo },
  { key: 'tipo', header: 'Tipo', value: (task) => task.tipo },
  { key: 'fase', header: 'Fase', value: (task) => task.fase },
  { key: 'estado', header: 'Estado', value: (task) => task.estado },
  { key: 'prioridad', header: 'Prioridad', value: (task) => task.prioridad },
  { key: 'fechaLimite', header: 'Fecha límite', value: (task) => task.fechaLimite || null },
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
  const [isGeneratingOpenTasksExcel, setIsGeneratingOpenTasksExcel] = useState(false);
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
  const activeTasks = useMemo(() => visibleTasks.filter((task) => !isTaskClosed(task)), [visibleTasks]);
  const taskSummary = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const total = activeTasks.length;
    const percentage = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
    const pending = activeTasks.filter((task) => task.estado === 'pendiente').length;
    const inProgress = activeTasks.filter((task) => task.estado === 'en curso').length;
    const critical = activeTasks.filter((task) => task.prioridad === 'critica').length;
    const dueToday = activeTasks.filter((task) => task.fechaLimite === todayIso).length;

    return {
      total,
      pending,
      inProgress,
      critical,
      dueToday,
      pendingPercentage: percentage(pending),
      inProgressPercentage: percentage(inProgress),
      criticalPercentage: percentage(critical),
      dueTodayPercentage: percentage(dueToday),
    };
  }, [activeTasks]);
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

  const handleGenerateOpenTasksExcel = async () => {
    const bridge = (window as unknown as {
      traccionTaskWord?: {
        refresh: () => Promise<{
          ok: boolean;
          skipped?: boolean;
          path: string | null;
          count: number;
          message: string;
        }>;
      };
    }).traccionTaskWord;

    if (!bridge) {
      await alert('La generación del Excel compartido solo está disponible en la aplicación de escritorio.');
      return;
    }

    setIsGeneratingOpenTasksExcel(true);
    try {
      const result = await bridge.refresh();
      if (result.skipped) {
        await alert(
          'No hay carpeta configurada para el Excel de tareas abiertas. Configúrala en Ajustes.',
        );
        return;
      }
      if (!result.ok) {
        await alert(result.message, { type: 'error' });
        return;
      }
      await alert(result.message);
    } catch (error) {
      await alert(
        `No se ha podido generar el Excel compartido: ${error instanceof Error ? error.message : String(error)}`,
        { type: 'error' },
      );
    } finally {
      setIsGeneratingOpenTasksExcel(false);
    }
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
        id: 'createdAt',
        header: 'Fecha creación',
        accessor: (task) => task.createdAt,
        render: (task) => task.createdAt.slice(0, 10),
        width: 115,
        minWidth: 105,
        maxWidth: 145,
        sortable: true,
        className: 'whitespace-nowrap text-metro-muted',
      },
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
        render: (task) => (
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${TASK_STATE_PILL[task.estado]}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATE_DOT[task.estado]}`} />
            {TASK_STATE_LABELS[task.estado]}
          </span>
        ),
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
        render: (task) => (
          <span className="inline-flex items-center gap-2 font-semibold text-metro-secondary">
            <span className={`h-2 w-2 rounded-full ${TASK_PRIORITY_DOT[task.prioridad]}`} />
            {TASK_PRIORITY_LABELS[task.prioridad]}
          </span>
        ),
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
        helpSections={TAREAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del centro operativo, prioridades, fases, orígenes e histórico."
        status={<InlineSaveFeedback />}
        title="Tareas"
      />

      <Toolbar
        className="border-slate-400/20 bg-[linear-gradient(180deg,rgba(31,48,69,0.78),rgba(20,35,54,0.74))] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_10px_24px_rgba(2,6,23,0.18)]"
        filters={
          <>
            <SearchField
              onChange={(event) => setFilter('search', event.target.value)}
              onClear={() => setFilter('search', '')}
              placeholder="Buscar tareas, responsables, palabras clave..."
              value={filters.search}
              wrapperClassName="min-w-[250px] flex-[1.4]"
            />
            <FilterSelect
              allLabel="Todos los tipos"
              aria-label="Filtrar tareas por tipo"
              onChange={(event) => setFilter('tipo', event.target.value as typeof filters.tipo)}
              options={TASK_TYPES}
              value={filters.tipo}
              wrapperClassName="w-[118px]"
            />
            <FilterSelect
              allLabel="Todas las fases"
              aria-label="Filtrar tareas por fase"
              onChange={(event) => setFilter('fase', event.target.value)}
              options={phaseFilterOptions}
              value={filters.fase}
              wrapperClassName="w-[128px]"
            />
            <FilterSelect
              allLabel="Todos los estados"
              aria-label="Filtrar tareas por estado"
              onChange={(event) => setFilter('estado', event.target.value as typeof filters.estado)}
              options={TASK_STATES.filter((estado) => estado !== 'cerrada')}
              value={filters.estado}
              wrapperClassName="w-[132px]"
            />
            <FilterSelect
              allLabel="Todas las prioridades"
              aria-label="Filtrar tareas por prioridad"
              onChange={(event) =>
                setFilter('prioridad', event.target.value as typeof filters.prioridad)
              }
              options={TASK_PRIORITIES}
              value={filters.prioridad}
              wrapperClassName="w-[148px]"
            />
            <FilterSelect
              allLabel="Todos los orígenes"
              aria-label="Filtrar tareas por origen"
              onChange={(event) => setFilter('origen', event.target.value)}
              options={originFilterOptions}
              value={filters.origen}
              wrapperClassName="w-[138px]"
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

      <div className="grid grid-cols-5 gap-2.5">
        <TaskSummaryCard
          detail="Total de tareas activas"
          icon={ListChecks}
          label="Activas"
          tone="blue"
          value={taskSummary.total}
        />
        <TaskSummaryCard
          detail={`${taskSummary.pendingPercentage}% del total`}
          icon={Clock3}
          label="Pendientes"
          tone="amber"
          value={taskSummary.pending}
        />
        <TaskSummaryCard
          detail={`${taskSummary.inProgressPercentage}% del total`}
          icon={PlayCircle}
          label="En curso"
          tone="cyan"
          value={taskSummary.inProgress}
        />
        <TaskSummaryCard
          detail={`${taskSummary.criticalPercentage}% del total`}
          icon={AlertTriangle}
          label="Críticas"
          tone="rose"
          value={taskSummary.critical}
        />
        <TaskSummaryCard
          detail={`${taskSummary.dueTodayPercentage}% del total`}
          icon={CalendarClock}
          label="Vencen hoy"
          tone="red"
          value={taskSummary.dueToday}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-300/[0.12] bg-[#0e2239]/70 shadow-[0_12px_30px_rgba(2,6,23,0.22)]">
        <div className="flex items-center justify-between border-b border-sky-300/10 bg-[linear-gradient(180deg,rgba(20,43,68,0.94),rgba(15,35,57,0.92))] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
            <SlidersHorizontal size={16} className="text-sky-300" /> Tareas activas
            <CountBadge>{filteredTasks.length} registros</CountBadge>
          </div>
          <div className="flex items-center gap-2">
            <ActionButton
              icon={FileSpreadsheet}
              iconOnly={false}
              loading={isGeneratingOpenTasksExcel}
              onClick={() => void handleGenerateOpenTasksExcel()}
              size="sm"
              variant="secondary"
            >
              {isGeneratingOpenTasksExcel ? 'Generando…' : 'Excel compartido'}
            </ActionButton>
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
          strongZebra
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
