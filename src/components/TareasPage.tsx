import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  ListChecks,
  PlayCircle,
  Settings,
} from 'lucide-react';
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
  type Task,
} from '../features/tareas/domain/task';
import { useTaskStore } from '../features/tareas/store/useTaskStore';
import { buildFilterLabel } from '../shared/export/filterLabel';
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
import { SearchField } from './ui/SearchField';
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
      'Ordenar la tabla por fecha, prioridad, fase o estado para revisar primero lo importante.',
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
  pendiente:
    'border-amber-400/40 bg-amber-400/10 text-amber-200 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.04)]',
  'en curso':
    'border-sky-400/40 bg-sky-400/10 text-sky-200 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.04)]',
  bloqueada:
    'border-rose-400/40 bg-rose-400/10 text-rose-200 shadow-[inset_0_0_0_1px_rgba(251,113,133,0.04)]',
  resuelta:
    'border-emerald-400/40 bg-emerald-400/10 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.04)]',
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
  alta: 'bg-orange-400',
  media: 'bg-amber-400',
  baja: 'bg-emerald-400',
};

function CompactTaskSummaryCard({
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
      card: 'border-sky-400/20 bg-[linear-gradient(135deg,rgba(30,64,175,0.14),rgba(14,34,57,0.9))]',
      icon: 'border-sky-400/15 bg-sky-400/10 text-sky-300',
      label: 'text-sky-300',
    },
    amber: {
      card: 'border-amber-400/20 bg-[linear-gradient(135deg,rgba(217,119,6,0.09),rgba(14,34,57,0.9))]',
      icon: 'border-amber-400/15 bg-amber-400/10 text-amber-300',
      label: 'text-amber-300',
    },
    cyan: {
      card: 'border-cyan-400/20 bg-[linear-gradient(135deg,rgba(6,182,212,0.09),rgba(14,34,57,0.9))]',
      icon: 'border-cyan-400/15 bg-cyan-400/10 text-cyan-300',
      label: 'text-cyan-300',
    },
    rose: {
      card: 'border-rose-400/20 bg-[linear-gradient(135deg,rgba(225,29,72,0.10),rgba(14,34,57,0.9))]',
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
    <div
      className={`flex min-w-0 items-center gap-3 rounded-2xl border px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_8px_20px_rgba(2,6,23,0.16)] ${toneMap.card}`}
    >
      <span
        className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border ${toneMap.icon}`}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[1.65rem] font-black leading-none text-metro-text">
          {value}
        </span>
        <span className={`mt-0.5 block truncate text-sm font-extrabold ${toneMap.label}`}>
          {label}
        </span>
        <span className="mt-0.5 block truncate text-[11px] font-medium text-metro-muted">
          {detail}
        </span>
      </span>
    </div>
  );
}

const TAREAS_TABLE_STORAGE_KEY = 'traccion.tableView.tareas.active.v3';

const defaultTareasTablePreferences: TableViewPreferences<ActiveTaskTableColumnId> = {
  sort: null,
  columnWidths: {
    createdAt: 115,
    titulo: 265,
    tipo: 96,
    fase: 130,
    estado: 122,
    prioridad: 112,
    fechaLimite: 122,
    sindicato: 135,
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
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const visibleTasks = useMemo(() => tasks.filter((task) => !task.deletedAt), [tasks]);
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
    setFilter('tipo', '');
    setFilter('fase', '');
    setFilter('estado', '');
    setFilter('prioridad', '');
    setFilter('origen', '');
  }, [load, loadConfiguracion, setFilter]);

  useEffect(() => {
    if (isHistoricOpen) {
      void loadHistoricalTasks();
    }
  }, [isHistoricOpen, loadHistoricalTasks]);

  const activeTasks = useMemo(
    () => visibleTasks.filter((task) => !isTaskClosed(task)),
    [visibleTasks],
  );

  const taskSummary = useMemo(() => {
    const now = new Date();
    const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
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

  const filteredTasks = useMemo(
    () =>
      filterTasks(tasks, {
        ...filters,
        tipo: '',
        fase: '',
        estado: '',
        prioridad: '',
        origen: '',
      }),
    [filters, tasks],
  );

  const historicTasks = useMemo(
    () => visibleTasks.filter((task) => isTaskClosed(task)),
    [visibleTasks],
  );
  const historicGroups = useMemo(
    () => (isHistoricOpen && historicalTasksLoaded ? groupHistoricTasks(historicTasks) : []),
    [historicTasks, historicalTasksLoaded, isHistoricOpen],
  );

  const activeTasksFilterLabel = buildFilterLabel([['Búsqueda', filters.search]]);

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
      await alert(
        'La generación del Excel compartido solo está disponible en la aplicación de escritorio.',
      );
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
        `No se ha podido generar el Excel compartido: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
        width: 265,
        minWidth: 180,
        maxWidth: 500,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'tipo',
        header: 'Tipo',
        accessor: (task) => task.tipo,
        render: (task) => task.tipo,
        width: 96,
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
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${TASK_STATE_PILL[task.estado]}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${TASK_STATE_DOT[task.estado]}`} />
            {TASK_STATE_LABELS[task.estado]}
          </span>
        ),
        width: 122,
        minWidth: 98,
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
        width: 112,
        minWidth: 94,
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
        width: 122,
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
        width: 135,
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
    editorMode === 'edit'
      ? (visibleTasks.find((task) => task.id === editingTaskId) ?? null)
      : null;

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
    <section className="space-y-3" id="tareas">
      <PageHeader
        helpSections={TAREAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del centro operativo, prioridades, seguimiento e histórico."
        status={<InlineSaveFeedback />}
        title="Tareas"
      />

      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-5">
        <CompactTaskSummaryCard
          detail="Total de tareas activas"
          icon={ListChecks}
          label="Activas"
          tone="blue"
          value={taskSummary.total}
        />
        <CompactTaskSummaryCard
          detail={`${taskSummary.pendingPercentage}% del total`}
          icon={Clock3}
          label="Pendientes"
          tone="amber"
          value={taskSummary.pending}
        />
        <CompactTaskSummaryCard
          detail={`${taskSummary.inProgressPercentage}% del total`}
          icon={PlayCircle}
          label="En curso"
          tone="cyan"
          value={taskSummary.inProgress}
        />
        <CompactTaskSummaryCard
          detail={`${taskSummary.criticalPercentage}% del total`}
          icon={AlertTriangle}
          label="Críticas"
          tone="rose"
          value={taskSummary.critical}
        />
        <CompactTaskSummaryCard
          detail={`${taskSummary.dueTodayPercentage}% del total`}
          icon={CalendarClock}
          label="Vencen hoy"
          tone="red"
          value={taskSummary.dueToday}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-sky-300/[0.12] bg-[#0e2239]/70 shadow-[0_12px_30px_rgba(2,6,23,0.22)]">
        <div className="space-y-3 border-b border-sky-300/10 bg-[linear-gradient(180deg,rgba(20,43,68,0.94),rgba(15,35,57,0.92))] px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-metro-text">
              <ListChecks size={16} className="text-sky-300" />
              Tareas activas
              <CountBadge>{filteredTasks.length} registros</CountBadge>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <ActionButton iconOnly={false} onClick={openCreateEditor} size="sm" variant="add">
                Nueva tarea
              </ActionButton>
              <ActionButton
                icon={Settings}
                iconOnly={false}
                onClick={() => setIsOriginsModalOpen(true)}
                size="sm"
                variant="secondary"
              >
                Orígenes
              </ActionButton>
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

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <SearchField
              onChange={(event) => setFilter('search', event.target.value)}
              onClear={() => setFilter('search', '')}
              placeholder="Buscar tareas, texto de seguimiento o palabras clave..."
              value={filters.search}
              wrapperClassName="min-w-[280px] xl:max-w-[440px]"
            />
            <p className="text-xs leading-relaxed text-metro-muted">
              Vista optimizada para ordenar por columnas. Los filtros laterales se eliminan para
              ganar espacio útil.
            </p>
          </div>
        </div>

        <DataTable
          ariaLabel="Tareas activas"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={activeTaskColumns}
          emptyMessage="No hay tareas activas con la búsqueda aplicada."
          getRowId={(task) => task.id}
          maxHeightClassName="max-h-[520px]"
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
