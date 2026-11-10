import {
  AlertTriangle,
  CalendarClock,
  Bell,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  ListChecks,
  LockKeyhole,
  PlayCircle,
  Settings,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ModuleHelpSection } from './ModuleHelp';
import { ActionButton } from './ui/ActionButton';
import { PageHeader } from './ui/PageHeader';
import { ActiveFilterChips, type ActiveFilterChip } from '../shared/filters/ActiveFilterChips';
import { InlineSaveFeedback } from './InlineSaveFeedback';
import { useConfiguracionStore } from '../features/configuracion/store/useConfiguracionStore';
import { responsibleMatchesWindowsUser } from '../features/configuracion/domain/taskResponsibles';
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
import { TaskQuickActionsPreview } from './task-editor/TaskQuickActionsPreview';
import { getTaskQuickActions } from './task-editor/taskQuickActions';
import { useAppDialog } from '../hooks/useAppDialog';
import { TaskOriginsModal } from '../features/tareas/components/TaskOriginsModal';
import { HistoricYearSection } from '../features/tareas/components/TareasHistoricSection';
import {
  DEFAULT_HISTORIC_PAGE_SIZE,
  groupHistoricTasks,
  type HistoricSortKey,
  type HistoricSortState,
} from '../features/tareas/components/tareasHistoricUtils';

const pendingQuickActions = (task: Task) => task.seguimiento.reduce((total, entry) => total + (entry.quickActions?.filter((action) => !action.completedAt).length ?? 0), 0);

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
    title: 'Vista principal y edición compartida',
    items: [
      'Los botones Todas, Mías y Sin asignar filtran por responsable; la búsqueda también permite localizar texto del seguimiento. Puedes ordenar las columnas para priorizar lo que necesitas revisar.',
      'La tabla principal muestra las tareas activas. El histórico se consulta por separado para no mezclar asuntos cerrados con trabajo pendiente.',
      'Al abrir una tarea existente, TrAcción adquiere un bloqueo compartido y comprueba su última versión antes de permitir cambios. Si otra persona está editando, la ficha permanece en modo consulta.',
      'Si pierdes la conexión o el bloqueo, no fuerces un guardado: conserva los cambios sin guardar y vuelve a abrir la ficha cuando se recupere la sincronización.',
    ],
  },
  {
    title: 'Guardado con resultado incierto',
    items: [
      'Si un guardado supera el tiempo de espera, no significa necesariamente que haya fallado: podría terminar después. TrAcción mantiene el borrador para que no pierdas el trabajo.',
      'Si aparece el aviso de guardado incierto, vuelve a pulsar Guardar para comprobar primero si se completó la operación anterior. Esa comprobación no repite automáticamente el guardado.',
      'Si otro usuario ha modificado el registro o no es posible confirmar el resultado, sigue el mensaje que aparece en la ficha; no copies ni reenvíes el seguimiento a ciegas.',
      'Las acciones directas de seguimiento, como editar o completar una actuación pendiente, también comprueban los guardados cuyo resultado no se confirmó.',
    ],
  },
  {
    title: 'Correo de origen',
    items: [
      'En la ficha de una tarea puedes arrastrar o seleccionar un correo de Outlook en formato .msg.',
      'TrAcción incorpora al campo Email de origen el remitente, la fecha, el asunto y el contenido del mensaje en texto plano; el correo sirve como contexto de la tarea y no se envía ni modifica desde la aplicación.',
      'Si Outlook no permite arrastrar directamente el mensaje, guárdalo primero como archivo .msg y selecciónalo desde la ficha.',
    ],
  },
  {
    title: 'Avisos, impresión y exportación',
    items: [
      'Cuando una tarea se asigna a una persona, TrAcción genera un aviso de nueva asignación. La campana de la cabecera permite consultar las asignaciones pendientes de abrir y acceder directamente a la tarea.',
      'El aviso sirve para descubrir la nueva asignación; abrirlo no cambia el estado funcional de la tarea ni la da por resuelta.',
      'Desde el detalle de una tarea se puede preparar una vista de impresión y exportar un informe a Excel con sus datos y seguimiento.',
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

const TASK_STATE_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  'en curso': 'En curso',
  bloqueada: 'Bloqueada',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
};

const TASK_STATE_PILL: Record<string, string> = {
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

const TASK_STATE_DOT: Record<string, string> = {
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
  const toneClass = {
    blue: 'text-sky-300',
    amber: 'text-amber-300',
    cyan: 'text-cyan-300',
    rose: 'text-rose-300',
    red: 'text-red-300',
  }[tone];

  return (
    <div
      className="tareas-kpi-card flex min-w-max flex-1 items-center justify-center gap-2 border-r border-white/10 px-3 py-2 last:border-r-0"
      title={`${value} ${label}. ${detail}`}
    >
      <Icon aria-hidden="true" className={`shrink-0 ${toneClass}`} size={17} />
      <span className="text-[17px] font-bold leading-none tabular-nums text-metro-text">{value}</span>
      <span className={`whitespace-nowrap text-xs font-semibold ${toneClass}`}>{label}</span>
    </div>
  );
}

const TAREAS_TABLE_STORAGE_KEY = 'traccion.tableView.tareas.active.v5';

const ATTENTION_PRIORITIES = new Set<Task['prioridad']>(['critica', 'alta']);

function needsTaskAttention(task: Task, today: string): boolean {
  if (isTaskClosed(task) || task.estado === 'resuelta') return false;
  return task.estado === 'bloqueada' ||
    (Boolean(task.fechaLimite) && task.fechaLimite <= today) ||
    (ATTENTION_PRIORITIES.has(task.prioridad) && task.estado !== 'resuelta');
}

function compareTaskAttention(first: Task, second: Task, today: string): number {
  const rank = (task: Task) => isTaskClosed(task) || task.estado === 'resuelta' ? 5
    : task.estado === 'bloqueada' ? 0
    : task.fechaLimite && task.fechaLimite < today ? 1
    : task.fechaLimite === today ? 2
    : ATTENTION_PRIORITIES.has(task.prioridad) && task.estado !== 'resuelta' ? 3 : 4;
  return rank(first) - rank(second);
}


function taskLastFollowUp(task: Task): Date | null {
  const timestamps = task.seguimiento
    .map((entry) => new Date(entry.fechaHora).getTime())
    .filter((timestamp) => Number.isFinite(timestamp));
  if (timestamps.length === 0) return null;
  return new Date(Math.max(...timestamps));
}

function taskFollowUpLabel(task: Task, now: number): { label: string; className: string } | null {
  if (isTaskClosed(task) || task.estado === 'resuelta') return null;
  const lastFollowUp = taskLastFollowUp(task);
  if (!lastFollowUp) return { label: 'Sin seguimientos registrados', className: 'text-metro-muted' };
  const elapsedDays = Math.max(0, Math.floor((now - lastFollowUp.getTime()) / 86_400_000));
  if (elapsedDays >= 15) return { label: `Sin seguimiento desde hace ${elapsedDays} días`, className: 'text-red-600 dark:text-red-400' };
  if (elapsedDays >= 7) return { label: `Último seguimiento hace ${elapsedDays} días`, className: 'text-amber-600 dark:text-amber-400' };
  if (elapsedDays === 0) return { label: 'Seguimiento hoy', className: 'text-emerald-700 dark:text-emerald-400' };
  return { label: `Seguimiento hace ${elapsedDays} día${elapsedDays === 1 ? '' : 's'}`, className: 'text-emerald-700 dark:text-emerald-400' };
}

const defaultTareasTablePreferences: TableViewPreferences<ActiveTaskTableColumnId> = {
  sort: null,
  columnWidths: {
    createdAt: 115,
    titulo: 620,
    fase: 130,
    estado: 122,
    prioridad: 112,
    fechaLimite: 122,
    sindicato: 135,
  },
  columnOrder: null,
};

const tareasTableColumnIds: ActiveTaskTableColumnId[] = [
  'prioridad',
  'estado',
  'createdAt',
  'titulo',
  'fase',
  'fechaLimite',
  'sindicato',
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
  initialResponsibleFilter,
  navigationNonce,
}: {
  initialTaskId?: string | null;
  initialResponsibleFilter?: string;
  navigationNonce?: number;
} = {}) {
  const {
    filters,
    historicalTasksLoaded,
    isLoadingHistoricalTasks,
    load,
    loadHistoricalTasks,
    selectTask,
    setFilter,
    tasks,
  } = useTaskStore();
  const { alert, dialogNode } = useAppDialog();
  const loadConfiguracion = useConfiguracionStore((state) => state.load);
  const taskResponsibles = useConfiguracionStore((state) => state.taskResponsibles);
  const taskStates = useConfiguracionStore((state) => state.taskStates);
  const taskStateLabel = (id: string) => taskStates.find((state) => state.id === id)?.nombre ?? TASK_STATE_LABELS[id] ?? id;
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
  const [responsibleFilter, setResponsibleFilter] = useState<string>(initialResponsibleFilter ?? '');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [attentionOrder, setAttentionOrder] = useState(true);
  const [windowsUser, setWindowsUser] = useState('');
  const [otherTaskLocks, setOtherTaskLocks] = useState<Record<string, TraccionRecordLockOwnerInfo | null>>({});
  useEffect(() => {
    let active = true;
    let querying = false;
    const refresh = async () => {
      if (querying || !window.traccion?.listOtherTaskLocks || document.visibilityState === 'hidden') return;
      querying = true;
      try {
        const result = await window.traccion.listOtherTaskLocks();
        if (active && result.ok) setOtherTaskLocks(result.locks);
      } catch (error) {
        console.warn('[tareas] No se han podido actualizar los indicadores de edición.', error);
      } finally { querying = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [editorMode]);
  const processedNavigationNonceRef = useRef<number | null>(null);

  useEffect(() => {
    load();
    loadConfiguracion();
    setFilter('tipo', '');
    setFilter('fase', '');
    setFilter('estado', '');
    setFilter('prioridad', '');
    setFilter('origen', '');
    void window.traccion?.getWindowsUser?.().then((value) => setWindowsUser(value ?? '')).catch(() => setWindowsUser(''));
  }, [load, loadConfiguracion, setFilter]);

  useEffect(() => {
    if (initialResponsibleFilter !== undefined) setResponsibleFilter(initialResponsibleFilter);
  }, [initialResponsibleFilter, navigationNonce]);

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

  const currentResponsible = useMemo(
    () => taskResponsibles.find((responsible) => responsible.active && responsibleMatchesWindowsUser(responsible, windowsUser)) ?? null,
    [taskResponsibles, windowsUser],
  );

  const [quickActionsOnly, setQuickActionsOnly] = useState(false);
  const [expandedQuickActionTaskIds, setExpandedQuickActionTaskIds] = useState<Set<string>>(() => new Set());
  const toggleQuickActionExpansion = (taskId: string) => {
    setExpandedQuickActionTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };
  useEffect(() => {
    const existingIds = new Set(tasks.filter((task) => !task.deletedAt).map((task) => task.id));
    setExpandedQuickActionTaskIds((current) => {
      const next = new Set([...current].filter((id) => existingIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [tasks]);
  const filteredTasks = useMemo(() => {
    const base = filterTasks(tasks, {
        ...filters,
        tipo: '',
        fase: '',
        estado: '',
        prioridad: '',
        origen: '',
      });
    const quickFiltered = quickActionsOnly ? base.filter((task) => pendingQuickActions(task) > 0) : base;
    if (!responsibleFilter) return quickFiltered;
    if (responsibleFilter === '__unassigned__') return quickFiltered.filter((task) => !task.responsable.trim());
    if (responsibleFilter === '__mine__') {
      if (!currentResponsible) return [];
      return quickFiltered.filter((task) => task.responsable.trim().toLocaleLowerCase('es') === currentResponsible.nombre.trim().toLocaleLowerCase('es'));
    }
    return quickFiltered.filter((task) => task.responsable.trim().toLocaleLowerCase('es') === responsibleFilter.trim().toLocaleLowerCase('es'));
  }, [currentResponsible, filters, responsibleFilter, tasks, quickActionsOnly]);

  const historicTasks = useMemo(
    () => visibleTasks.filter((task) => isTaskClosed(task)),
    [visibleTasks],
  );
  const historicGroups = useMemo(
    () => (isHistoricOpen && historicalTasksLoaded ? groupHistoricTasks(historicTasks) : []),
    [historicTasks, historicalTasksLoaded, isHistoricOpen],
  );

  const activeTasksFilterLabel = buildFilterLabel([['Búsqueda', filters.search]]);
  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const chips: ActiveFilterChip[] = [];
    if (filters.search.trim()) chips.push({ key: 'search', label: 'Búsqueda', value: filters.search.trim(), onClear: () => setFilter('search', '') });
    if (responsibleFilter) {
      const value = responsibleFilter === '__mine__' ? 'Mías' : responsibleFilter === '__unassigned__' ? 'Sin asignar' : responsibleFilter;
      chips.push({ key: 'responsible', label: 'Responsable', value, onClear: () => setResponsibleFilter('') });
    }
    return chips;
  }, [filters.search, responsibleFilter, setFilter]);
  const clearActiveFilters = () => { setFilter('search', ''); setResponsibleFilter(''); };

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
        window.dispatchEvent(new CustomEvent('traccion:excel-backup-failure', {
          detail: {
            message: 'No se ha podido actualizar el Excel de tareas abiertas. Comprueba que esté cerrado y que la red esté disponible.',
            retry: async () => {
              const retried = await bridge.refresh();
              if (!retried.ok) throw new Error(retried.message);
              return true;
            },
          },
        }));
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

  const nowForAttention = new Date();
  const todayForAttention = `${nowForAttention.getFullYear()}-${String(nowForAttention.getMonth() + 1).padStart(2, '0')}-${String(nowForAttention.getDate()).padStart(2, '0')}`;
  const attentionCount = filteredTasks.filter((task) => needsTaskAttention(task, todayForAttention)).length;
  const activeTaskRows = useMemo(() => {
    const base = attentionOnly
      ? filteredTasks.filter((task) => needsTaskAttention(task, todayForAttention))
      : filteredTasks;
    if (preferences.sort) return base;
    const sorted = sortTasksByDefault(base);
    return attentionOrder
      ? [...sorted].sort((first, second) => compareTaskAttention(first, second, todayForAttention))
      : sorted;
  }, [filteredTasks, preferences.sort, attentionOnly, attentionOrder, todayForAttention]);

  const activeTaskColumns = useMemo<Array<DataTableColumn<Task, ActiveTaskTableColumnId>>>(
    () => [
      {
        id: 'prioridad',
        header: 'Prioridad',
        accessor: (task) => PRIORITY_ORDER.get(task.prioridad) ?? TASK_PRIORITIES.length,
        render: (task) => (
          <span className="inline-flex items-center gap-2 font-semibold text-metro-secondary">
            <span className={`h-5 w-1 shrink-0 rounded-full ${TASK_PRIORITY_DOT[task.prioridad]}`} aria-hidden="true" />
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
        id: 'estado',
        header: 'Estado',
        accessor: (task) => task.estado,
        render: (task) => {
          const label = taskStates.find((state) => state.id === task.estado)?.nombre ?? TASK_STATE_LABELS[task.estado] ?? task.estado;
          const isTratarConRosa = label.trim().toLocaleLowerCase('es-ES') === 'tratar con rosa';
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${isTratarConRosa ? 'border-pink-400/50 bg-pink-400/15 text-pink-200' : (TASK_STATE_PILL[task.estado] ?? 'border-metro-border bg-metro-panel text-metro-text')}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isTratarConRosa ? 'bg-pink-400' : (TASK_STATE_DOT[task.estado] ?? 'bg-slate-400')}`} />
              {label}
            </span>
          );
        },
        width: 122,
        minWidth: 98,
        maxWidth: 180,
        sortable: true,
        className: 'text-metro-muted',
      },
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
        render: (task) => {
          const activity = taskFollowUpLabel(task, Date.now());
          const hasQuickActions = getTaskQuickActions(task).length > 0;
          const expanded = expandedQuickActionTaskIds.has(task.id);
          return (
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                {hasQuickActions && (
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sky-300 hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                    aria-label={`${expanded ? 'Ocultar' : 'Mostrar'} acciones vinculadas de ${task.titulo}`}
                    aria-controls={`task-actions-${task.id}`}
                    aria-expanded={expanded}
                    title={expanded ? 'Ocultar acciones vinculadas' : 'Ver acciones vinculadas'}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleQuickActionExpansion(task.id);
                    }}
                  >
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                )}{(otherTaskLocks[task.id] || otherTaskLocks.__module__) && <span className="inline-flex shrink-0 text-amber-400" title="Esta tarea está siendo editada por otra persona" aria-label="Edición reservada por otra persona"><LockKeyhole size={14} aria-hidden="true" /></span>}{pendingQuickActions(task) > 0 && <span title={`${pendingQuickActions(task)} acciones pendientes`} className="inline-flex shrink-0 items-center gap-0.5 text-red-400"><Bell size={14}/><span className="text-[10px] font-bold">{pendingQuickActions(task)}</span></span>}<span className="truncate font-semibold text-metro-text" title={task.titulo}>{task.titulo}</span></div>
              {activity && <div className={`mt-0.5 truncate text-[11px] font-normal leading-4 ${activity.className}`} title={activity.label}>{activity.label}</div>}
            </div>
          );
        },
        width: 620,
        minWidth: 260,
        maxWidth: 1100,
        sortable: true,
        className: 'font-semibold text-metro-text',
      },
      {
        id: 'fase',
        header: 'Fase',
        accessor: (task) => task.fase,
        render: (task) => {
          const fase = task.fase.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const isComite = /\bcomite\b/.test(fase);
          const isParitaria = /\bparitaria\b/.test(fase);
          return (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {(isComite || isParitaria) && (
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${isComite ? 'bg-blue-500' : 'bg-slate-400'}`}
                />
              )}
              <span className="truncate" title={task.fase}>{task.fase}</span>
            </span>
          );
        },
        width: 110,
        minWidth: 90,
        maxWidth: 230,
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
        width: 110,
        minWidth: 90,
        maxWidth: 220,
        sortable: true,
        className: 'text-metro-muted',
      },
    ],
    [taskStates, otherTaskLocks, expandedQuickActionTaskIds],
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
    <section className="space-y-2" id="tareas">
      <PageHeader
        helpSections={TAREAS_HELP_SECTIONS}
        helpSubtitle="Guía rápida del centro operativo, prioridades, seguimiento e histórico."
        status={<InlineSaveFeedback />}
        title="Tareas"
      />

      <div className="tareas-kpi-grid flex min-w-0 items-center overflow-x-auto rounded-xl border border-sky-300/15 bg-[#122239]/85 shadow-[0_6px_16px_rgba(2,6,23,0.14)]" aria-label="Resumen de tareas activas">
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
          label={taskStateLabel('pendiente')}
          tone="amber"
          value={taskSummary.pending}
        />
        <CompactTaskSummaryCard
          detail={`${taskSummary.inProgressPercentage}% del total`}
          icon={PlayCircle}
          label={taskStateLabel('en curso')}
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

      <div className="overflow-hidden rounded-xl border border-sky-300/[0.12] bg-[#0e2239]/70 shadow-[0_12px_30px_rgba(2,6,23,0.22)]">
        <div className="tareas-toolbar border-b border-sky-300/10 bg-[linear-gradient(180deg,rgba(20,43,68,0.94),rgba(15,35,57,0.92))] px-3 py-2">
          <div className="tareas-responsables flex min-w-0 items-center gap-1.5 overflow-x-auto">
            <button className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${!responsibleFilter ? 'border-sky-300/30 bg-sky-400/15 text-sky-100' : 'border-sky-300/10 bg-white/[0.025] text-slate-400 hover:text-slate-200'}`} onClick={() => setResponsibleFilter('')} type="button">Todas</button>
            <button className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${responsibleFilter === '__mine__' ? 'border-sky-300/30 bg-sky-400/15 text-sky-100' : 'border-sky-300/10 bg-white/[0.025] text-slate-400 hover:text-slate-200'}`} onClick={() => setResponsibleFilter('__mine__')} type="button">Mías</button>
            {taskResponsibles
              .filter((responsible) => responsible.active)
              .filter((responsible) => !currentResponsible || responsible.id !== currentResponsible.id)
              .map((responsible) => (
              <button className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${responsibleFilter === responsible.nombre ? 'border-sky-300/30 bg-sky-400/15 text-sky-100' : 'border-sky-300/10 bg-white/[0.025] text-slate-400 hover:text-slate-200'}`} key={responsible.id} onClick={() => setResponsibleFilter(responsible.nombre)} type="button">{responsible.nombre}</button>
            ))}
            <button className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${responsibleFilter === '__unassigned__' ? 'border-amber-300/30 bg-amber-400/10 text-amber-100' : 'border-sky-300/10 bg-white/[0.025] text-slate-400 hover:text-slate-200'}`} onClick={() => setResponsibleFilter('__unassigned__')} type="button">Sin asignar</button>
          </div>
          <div className="tareas-toolbar-main">
            <SearchField
              onChange={(event) => setFilter('search', event.target.value)}
              onClear={() => setFilter('search', '')}
              placeholder="Buscar tareas, texto de seguimiento o palabras clave..."
              value={filters.search}
              wrapperClassName="tareas-toolbar-search w-full min-w-0"
            />

            <div className="tareas-toolbar-actions flex min-w-0 items-center gap-1.5">
              <ActionButton iconOnly={false} onClick={openCreateEditor} size="sm" variant="add">
                Nueva tarea
              </ActionButton>
              <ActionButton
                icon={Settings}
                iconOnly
                title="Orígenes"
                onClick={() => setIsOriginsModalOpen(true)}
                size="sm"
                variant="secondary"
              >
                Orígenes
              </ActionButton>
              <ActionButton
                icon={FileSpreadsheet}
                iconOnly
                title="Excel compartido"
                loading={isGeneratingOpenTasksExcel}
                onClick={() => void handleGenerateOpenTasksExcel()}
                size="sm"
                variant="secondary"
              >
                {isGeneratingOpenTasksExcel ? 'Generando…' : 'Excel compartido'}
              </ActionButton>
              <ExportPrintButtons
                compactIcons
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
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-sky-300/10 px-3 py-2 text-xs">
          <button type="button" aria-pressed={attentionOnly} onClick={() => setAttentionOnly((value) => !value)} className={`rounded-lg border px-2.5 py-1.5 font-semibold ${attentionOnly ? 'border-rose-400/50 bg-rose-400/15 text-rose-200' : 'border-metro-border text-metro-muted hover:text-metro-text'}`}>
            Requieren atención ({attentionCount})
          </button>
          <button type="button" aria-pressed={attentionOrder} onClick={() => { setAttentionOrder((value) => !value); if (preferences.sort) setSort(null); }} className={`rounded-lg border px-2.5 py-1.5 font-semibold ${attentionOrder && !preferences.sort ? 'border-sky-400/40 bg-sky-400/10 text-sky-200' : 'border-metro-border text-metro-muted hover:text-metro-text'}`}>
            Priorizar atención {attentionOrder && !preferences.sort ? '✓' : ''}
          </button>
          <span className="hidden text-metro-muted 2xl:inline">Atención: bloqueadas, vencidas, vencen hoy o prioridad alta/crítica.</span>
          <span className="min-w-0 flex-1" />
          <button type="button" aria-pressed={quickActionsOnly} onClick={() => setQuickActionsOnly((value) => !value)} className={`rounded-lg border px-2.5 py-1.5 font-semibold ${quickActionsOnly ? "border-rose-400/40 bg-rose-400/15 text-rose-200" : "border-metro-border text-metro-muted hover:text-metro-text"}`}><Bell size={12} className="mr-1 inline"/>Con acciones pendientes</button>
          <CountBadge>{activeTaskRows.length} registros</CountBadge>
        </div>
        <div className="px-3 pt-1">
          <ActiveFilterChips filters={activeFilterChips} onClearAll={clearActiveFilters} />
        </div>

        <DataTable
          ariaLabel="Tareas activas"
          columnOrder={preferences.columnOrder}
          columnWidths={preferences.columnWidths}
          onResetColumnWidths={resetColumnWidths}
          columns={activeTaskColumns}
          emptyMessage="No hay tareas activas con la búsqueda aplicada."
          getRowId={(task) => task.id}
          maxHeightClassName="max-h-[min(72vh,1000px)]"
          onColumnOrderChange={setColumnOrder}
          onColumnWidthChange={setColumnWidth}
          onRowClick={openEditor}
          isRowExpanded={(task) => expandedQuickActionTaskIds.has(task.id) && getTaskQuickActions(task).length > 0}
          renderExpandedRow={(task) => <TaskQuickActionsPreview task={task} />}
          onSortChange={setSort}
          rows={activeTaskRows}
          sort={preferences.sort}
          strongZebra
          preserveScrollOnRowsChange
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
