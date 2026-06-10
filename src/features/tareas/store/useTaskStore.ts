import { create } from 'zustand';
import { EMPTY_TASK_FILTERS, type TaskFilters } from '../domain/filters';
import { readStorageItem, writeStorageItem } from '../../../services/persistence';
import { addAuditEvent, buildAuditChanges, buildUpdateSummary } from '../../../shared/audit/auditTrail';
import {
  CLOSED_TASK_PHASE,
  DEFAULT_TASK_PHASE,
  EMPTY_TASK_DRAFT,
  isTaskClosed,
  migratePeticionToTask,
  TASK_PRIORITIES,
  TASK_STATES,
  TASK_TYPES,
  type LegacyPeticionForTaskMigration,
  type Task,
  type TaskDocumentLink,
  type TaskDraft,
  type TaskSeguimientoEntry,
} from '../domain/task';

const STORAGE_KEY = 'traccion.v1.tareas.tasks';
const LEGACY_PETICIONES_STORAGE_KEY = 'traccion.v1.peticiones.peticiones';
const PETICIONES_MIGRATION_FLAG_KEY = 'traccion.v1.tareas.peticionesMigrated';


const TASK_AUDIT_LABELS = {
  titulo: 'Título',
  descripcion: 'Descripción',
  tipo: 'Tipo',
  fase: 'Fase',
  estado: 'Estado',
  prioridad: 'Prioridad',
  fechaLimite: 'Fecha límite',
  responsable: 'Responsable',
  origen: 'Detalle origen',
  sindicato: 'Origen',
  observaciones: 'Observaciones',
  mail: 'Email',
} satisfies Partial<Record<keyof TaskDraft, string>>;

const TASK_AUDIT_FIELDS: Array<keyof TaskDraft> = [
  'titulo',
  'descripcion',
  'tipo',
  'fase',
  'estado',
  'prioridad',
  'fechaLimite',
  'responsable',
  'origen',
  'sindicato',
  'observaciones',
  'mail',
];

function pickTaskAuditSnapshot(task: Task | TaskDraft): Record<string, unknown> {
  return TASK_AUDIT_FIELDS.reduce<Record<string, unknown>>((snapshot, field) => {
    snapshot[field] = task[field];
    return snapshot;
  }, {});
}

function registerTaskUpdateAudit(previousTask: Task, draft: TaskDraft): void {
  const changes = buildAuditChanges(
    pickTaskAuditSnapshot(previousTask),
    pickTaskAuditSnapshot(draft),
    TASK_AUDIT_LABELS,
    TASK_AUDIT_FIELDS,
  );

  if (changes.length === 0) {
    return;
  }

  addAuditEvent({
    module: 'tareas',
    entityId: previousTask.id,
    action: changes.some((change) => change.field === 'estado') ? 'status_changed' : 'updated',
    summary: buildUpdateSummary(changes),
    changes,
  });
}

const SESSION_TASK_REFERENCES = [
  {
    storageKey: 'traccion.v1.comite.sessions',
    module: 'comite',
    moduleLabel: 'Comité de Empresa',
  },
  {
    storageKey: 'traccion.v1.paritaria.sessions',
    module: 'paritaria',
    moduleLabel: 'Comisión Paritaria',
  },
] as const;

type SessionTaskReference = {
  taskId: string;
  module: string;
  moduleLabel: string;
  sessionLabel: string;
  sessionDocumentCode: string;
  sessionDate: string;
  closedAt: string;
};

type StoredManagedSessionForTaskSync = {
  id: string;
  date: string;
  code: string;
  title: string;
  status: 'open' | 'closed';
  items: string[];
  treatedTaskIds: string[];
  untreatedTaskIds: string[];
  closedAt: string | null;
};

interface TaskUpdateResult {
  ok: boolean;
  message: string;
}

interface TaskStateStore {
  tasks: Task[];
  selectedTaskId: string;
  filters: TaskFilters;
  load: () => void;
  reloadFromStorage: () => void;
  create: (draft: TaskDraft, seguimientoText?: string) => void;
  createManyFromImport: (
    drafts: Array<{ externalKey: string; draft: TaskDraft; closedAt?: string | null }>,
  ) => Record<string, string>;
  update: (id: string, draft: TaskDraft, seguimientoText?: string) => void;
  updateWithConcurrencyCheck: (
    id: string,
    draft: TaskDraft,
    seguimientoText: string | undefined,
    expectedUpdatedAt: string | null,
    latestTasks: Task[],
  ) => TaskUpdateResult;
  remove: (id: string) => void;
  selectTask: (taskId: string) => void;
  closeTasksFromCommittee: (taskIds: string[], sessionLabel: string) => void;
  closeTasksFromSession: (taskIds: string[], moduleLabel: string, sessionLabel: string) => void;
  setFilter: <K extends keyof TaskFilters>(key: K, value: TaskFilters[K]) => void;
}

function isTaskSeguimientoEntry(value: unknown): value is TaskSeguimientoEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskSeguimientoEntry, unknown>>;
  return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
}

function hasStringProperty<K extends string>(
  value: unknown,
  property: K,
): value is Record<K, string> {
  return (
    value !== null &&
    typeof value === 'object' &&
    property in value &&
    typeof (value as Record<K, unknown>)[property] === 'string'
  );
}

function isTask(value: unknown): value is Task {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof Task, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    (TASK_STATES as readonly string[]).includes(candidate.estado) &&
    typeof candidate.prioridad === 'string' &&
    (TASK_PRIORITIES as readonly string[]).includes(candidate.prioridad)
  );
}

function isLegacyPeticion(value: unknown): value is LegacyPeticionForTaskMigration {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof LegacyPeticionForTaskMigration, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.titulo === 'string' &&
    typeof candidate.descripcion === 'string' &&
    typeof candidate.estado === 'string' &&
    typeof candidate.prioridad === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isStoredManagedSessionForTaskSync(
  value: unknown,
): value is StoredManagedSessionForTaskSync {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof StoredManagedSessionForTaskSync, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.title === 'string' &&
    (candidate.status === 'open' || candidate.status === 'closed') &&
    isStringArray(candidate.items) &&
    (candidate.treatedTaskIds === undefined || isStringArray(candidate.treatedTaskIds)) &&
    (candidate.untreatedTaskIds === undefined || isStringArray(candidate.untreatedTaskIds)) &&
    (candidate.closedAt === null ||
      candidate.closedAt === undefined ||
      typeof candidate.closedAt === 'string')
  );
}

function isHistoricalSessionDate(date: string): boolean {
  const year = Number(date.match(/^(\d{4})/)?.[1] ?? 0);
  return year > 0 && year < 2026;
}

function formatSessionDateForTask(date: string): string {
  if (!date) {
    return 'Sin fecha';
  }

  const parsedDate = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsedDate.getTime()) ? date : parsedDate.toLocaleDateString('es-ES');
}

function buildSessionLabelForTask(
  session: Pick<StoredManagedSessionForTaskSync, 'code' | 'date'>,
): string {
  return `${session.code || 'Sin código'} · ${formatSessionDateForTask(session.date)}`;
}

function readClosedSessionTaskReferences(): Map<string, SessionTaskReference> {
  const references = new Map<string, SessionTaskReference>();

  SESSION_TASK_REFERENCES.forEach((source) => {
    const storedSessions = readStoredArray(source.storageKey).filter(
      isStoredManagedSessionForTaskSync,
    );

    storedSessions.forEach((session) => {
      const forceHistorical = isHistoricalSessionDate(session.date);
      const isClosedSession = session.status === 'closed' || forceHistorical;
      if (!isClosedSession) {
        return;
      }

      const untreatedTaskIds = new Set(session.untreatedTaskIds ?? []);
      const treatedTaskIds =
        forceHistorical || (session.treatedTaskIds ?? []).length === 0
          ? session.items
          : (session.treatedTaskIds ?? []);
      const closedAt =
        session.closedAt ??
        (session.date ? `${session.date}T00:00:00.000Z` : new Date().toISOString());

      treatedTaskIds.forEach((taskId) => {
        if (!taskId || untreatedTaskIds.has(taskId)) {
          return;
        }

        references.set(taskId, {
          taskId,
          module: source.module,
          moduleLabel: source.moduleLabel,
          sessionLabel: buildSessionLabelForTask(session),
          sessionDocumentCode: session.code.trim(),
          sessionDate: session.date,
          closedAt,
        });
      });
    });
  });

  return references;
}

function reconcileTasksWithClosedSessions(tasks: Task[]): Task[] {
  const references = readClosedSessionTaskReferences();
  if (references.size === 0) {
    return tasks;
  }

  const reconciledAt = new Date().toISOString();
  return tasks.map((task) => {
    const reference = references.get(task.id);
    if (!reference || task.deletedAt) {
      return task;
    }

    const trackingText = `Tratada en ${reference.moduleLabel} (${reference.sessionLabel}).`;
    const alreadyTracked = task.seguimiento.some((entry) => entry.texto === trackingText);
    const alreadyClosed = isTaskClosed(task);
    const nextTask: Task = {
      ...task,
      sessionDocumentCode: task.sessionDocumentCode || reference.sessionDocumentCode,
      sessionModule: task.sessionModule || reference.module,
      sessionDate: task.sessionDate || reference.sessionDate,
      estado: alreadyClosed ? task.estado : 'cerrada',
      fase: alreadyClosed ? task.fase : CLOSED_TASK_PHASE,
      closedAt: task.closedAt ?? reference.closedAt,
      updatedAt:
        alreadyClosed &&
        task.sessionDocumentCode === (task.sessionDocumentCode || reference.sessionDocumentCode) &&
        task.sessionModule === (task.sessionModule || reference.module) &&
        task.sessionDate === (task.sessionDate || reference.sessionDate) &&
        alreadyTracked
          ? task.updatedAt
          : reconciledAt,
      seguimiento: alreadyTracked
        ? task.seguimiento
        : [{ fechaHora: reference.closedAt, texto: trackingText }, ...task.seguimiento],
    };

    return nextTask;
  });
}

function getHistoricalImportDate(task: Task): string {
  const directDate = task.createdAt.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? task.fechaLimite;
  const notesDate =
    task.observaciones.match(/\b(20\d{2}-\d{2}-\d{2}|19\d{2}-\d{2}-\d{2})\b/)?.[1] ?? '';
  return directDate || notesDate;
}

function isHistoricalSessionImportTask(task: Task): boolean {
  const phase = task.fase.trim().toLowerCase();
  const origin = task.origen.trim().toLowerCase();
  const notes = task.observaciones.trim().toLowerCase();
  const looksLikeSessionImport =
    phase === 'comite' ||
    phase === 'paritaria' ||
    origin.includes('comité de empresa') ||
    origin.includes('comite de empresa') ||
    origin.includes('comisión paritaria') ||
    origin.includes('comision paritaria') ||
    notes.includes('importado de') ||
    notes.includes('resumen histórico de comité/paritaria') ||
    notes.includes('resumen historico de comite/paritaria') ||
    notes.includes('importkey:comite:') ||
    notes.includes('importkey:paritaria:');

  if (!looksLikeSessionImport) {
    return false;
  }

  const year = Number(getHistoricalImportDate(task).match(/^(\d{4})/)?.[1] ?? 0);
  return year > 0 && year < 2026;
}

function isTaskDocumentLink(value: unknown): value is TaskDocumentLink {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<keyof TaskDocumentLink, unknown>>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.nombre === 'string' &&
    typeof candidate.ruta === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function normalizeDocumentLinks(task: Task): TaskDocumentLink[] {
  return Array.isArray(task.documentLinks) ? task.documentLinks.filter(isTaskDocumentLink) : [];
}

function normalizeSeguimiento(task: Task): TaskSeguimientoEntry[] {
  if (Array.isArray(task.seguimiento)) {
    return task.seguimiento
      .filter(isTaskSeguimientoEntry)
      .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora));
  }

  const legacyUpdates = (task as { actualizaciones?: unknown }).actualizaciones;

  return Array.isArray(legacyUpdates)
    ? legacyUpdates
        .filter(isTaskSeguimientoEntry)
        .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora))
    : [];
}

function normalizeTask(task: Task): Task {
  const updatedAt = task.updatedAt ?? task.createdAt;
  const tipo = (TASK_TYPES as readonly string[]).includes(task.tipo)
    ? task.tipo
    : EMPTY_TASK_DRAFT.tipo;
  const fase = typeof task.fase === 'string' && task.fase.trim() ? task.fase : DEFAULT_TASK_PHASE;
  const estado = (TASK_STATES as readonly string[]).includes(task.estado)
    ? task.estado
    : EMPTY_TASK_DRAFT.estado;
  const normalizedTask = {
    id: task.id,
    titulo: task.titulo,
    descripcion: task.descripcion,
    tipo,
    fase,
    estado,
    prioridad: task.prioridad,
    fechaLimite: task.fechaLimite ?? EMPTY_TASK_DRAFT.fechaLimite,
    responsable: task.responsable ?? EMPTY_TASK_DRAFT.responsable,
    origen:
      task.origen ??
      (hasStringProperty(task, 'origenSindicato') ? task.origenSindicato : EMPTY_TASK_DRAFT.origen),
    sindicato: task.sindicato ?? EMPTY_TASK_DRAFT.sindicato,
    observaciones: task.observaciones ?? EMPTY_TASK_DRAFT.observaciones,
    mail: typeof task.mail === 'string' ? task.mail : EMPTY_TASK_DRAFT.mail,
    documentLinks: normalizeDocumentLinks(task),
    sessionDocumentCode:
      typeof task.sessionDocumentCode === 'string' ? task.sessionDocumentCode : '',
    sessionModule: typeof task.sessionModule === 'string' ? task.sessionModule : '',
    sessionDate: typeof task.sessionDate === 'string' ? task.sessionDate : '',
    seguimiento: normalizeSeguimiento(task),
    createdAt: task.createdAt,
    updatedAt,
    deletedAt: task.deletedAt ?? null,
    closedAt:
      task.closedAt ?? (estado === 'cerrada' || fase === CLOSED_TASK_PHASE ? updatedAt : null),
  } satisfies Task;

  if (!isHistoricalSessionImportTask(normalizedTask)) {
    return normalizedTask;
  }

  const historicalDate = getHistoricalImportDate(normalizedTask);
  const closedAt =
    normalizedTask.closedAt ?? (historicalDate ? `${historicalDate}T00:00:00.000Z` : updatedAt);

  return {
    ...normalizedTask,
    fase: CLOSED_TASK_PHASE,
    estado: 'cerrada',
    closedAt,
  };
}

function readStoredArray(storageKey: string): unknown[] {
  const stored = readStorageItem(storageKey);
  if (!stored) {
    return [];
  }

  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed : [];
}

function readMigratedPeticiones(): Task[] {
  if (readStorageItem(PETICIONES_MIGRATION_FLAG_KEY) === 'true') {
    return [];
  }

  return readStoredArray(LEGACY_PETICIONES_STORAGE_KEY)
    .filter(isLegacyPeticion)
    .map(migratePeticionToTask)
    .map(normalizeTask);
}

function readTasks(): Task[] {
  const rawCurrentTasks = readStoredArray(STORAGE_KEY).filter(isTask);
  const currentTasks = reconcileTasksWithClosedSessions(rawCurrentTasks.map(normalizeTask));
  const migratedTasks = readMigratedPeticiones().filter(
    (migratedTask) => !currentTasks.some((task) => task.id === migratedTask.id),
  );
  const currentTasksChanged = currentTasks.some(
    (task, index) => JSON.stringify(task) !== JSON.stringify(rawCurrentTasks[index]),
  );

  if (migratedTasks.length === 0) {
    if (currentTasksChanged) {
      persistTasks(currentTasks);
    }
    return currentTasks;
  }

  const tasks = reconcileTasksWithClosedSessions([...currentTasks, ...migratedTasks]);
  persistTasks(tasks);
  writeStorageItem(PETICIONES_MIGRATION_FLAG_KEY, 'true');
  return tasks;
}

function persistTasks(tasks: Task[]): void {
  writeStorageItem(STORAGE_KEY, JSON.stringify(tasks.map(normalizeTask)));
}

function firstActiveTaskId(tasks: Task[]): string {
  return tasks.find((task) => !task.deletedAt && !isTaskClosed(task))?.id ?? '';
}

function createTaskId(): string {
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSeguimiento(text: string | undefined, fechaHora: string): TaskSeguimientoEntry[] {
  const trimmedText = text?.trim();
  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];
}

function resolveClosedAt(task: Task, draft: TaskDraft, fechaHora: string): string | null {
  if (!isTaskClosed(draft)) {
    return null;
  }

  return isTaskClosed(task) ? (task.closedAt ?? fechaHora) : fechaHora;
}

function buildUpdatedTask(task: Task, draft: TaskDraft, seguimientoText: string | undefined): Task {
  const now = new Date().toISOString();
  registerTaskUpdateAudit(task, draft);

  return {
    ...task,
    ...draft,
    seguimiento: [...buildSeguimiento(seguimientoText, now), ...task.seguimiento],
    closedAt: resolveClosedAt(task, draft, now),
    updatedAt: now,
  };
}

export function parseTasksSnapshot(storageValue: string | null): Task[] {
  if (!storageValue) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(storageValue);
    return Array.isArray(parsed) ? parsed.filter(isTask).map(normalizeTask) : [];
  } catch {
    return [];
  }
}

export const useTaskStore = create<TaskStateStore>((set) => ({
  tasks: [],
  selectedTaskId: '',
  filters: EMPTY_TASK_FILTERS,
  load: () => {
    const tasks = readTasks();
    set({ tasks, selectedTaskId: firstActiveTaskId(tasks) });
  },
  reloadFromStorage: () => {
    const tasks = readTasks();
    set((state) => ({
      tasks,
      selectedTaskId: tasks.some((task) => task.id === state.selectedTaskId)
        ? state.selectedTaskId
        : firstActiveTaskId(tasks),
    }));
  },
  create: (draft, seguimientoText) => {
    set((state) => {
      const now = new Date().toISOString();
      const task: Task = {
        id: createTaskId(),
        ...draft,
        sessionDocumentCode: '',
        sessionModule: '',
        sessionDate: '',
        seguimiento: buildSeguimiento(seguimientoText, now),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        closedAt: isTaskClosed(draft) ? now : null,
      };
      addAuditEvent({
        module: 'tareas',
        entityId: task.id,
        action: 'created',
        summary: 'Registro creado',
        changes: [],
      });
      const tasks = [...state.tasks, task];
      persistTasks(tasks);
      return {
        tasks,
        selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id,
      };
    });
  },
  createManyFromImport: (drafts) => {
    const createdIds: Record<string, string> = {};
    set((state) => {
      const now = new Date().toISOString();
      const existingImportKeys = new Set(
        state.tasks
          .map((task) => task.observaciones.match(/ImportKey:([^\s]+)/)?.[1])
          .filter((value): value is string => Boolean(value)),
      );
      const importedTasks: Task[] = [];
      const tasksWithNormalizedExistingImports = state.tasks.map((task) => normalizeTask(task));
      const changedExistingTasks = tasksWithNormalizedExistingImports.some(
        (task, index) => JSON.stringify(task) !== JSON.stringify(state.tasks[index]),
      );

      drafts.forEach(({ externalKey, draft, closedAt }) => {
        if (existingImportKeys.has(externalKey)) {
          const existingTask = tasksWithNormalizedExistingImports.find((task) =>
            task.observaciones.includes(`ImportKey:${externalKey}`),
          );
          if (existingTask) {
            createdIds[externalKey] = existingTask.id;
          }
          return;
        }

        const task: Task = normalizeTask({
          id: createTaskId(),
          ...draft,
          sessionDocumentCode: '',
          sessionModule: '',
          sessionDate: '',
          observaciones: `${draft.observaciones ? `${draft.observaciones} ` : ''}ImportKey:${externalKey}`,
          seguimiento: buildSeguimiento(
            'Tarea importada desde resumen histórico de Comité/Paritaria.',
            now,
          ),
          createdAt: closedAt ?? now,
          updatedAt: now,
          deletedAt: null,
          closedAt: isTaskClosed(draft) ? (closedAt ?? now) : null,
        });
        createdIds[externalKey] = task.id;
        importedTasks.push(task);
      });

      if (importedTasks.length === 0 && !changedExistingTasks) {
        return state;
      }

      const tasks = [...tasksWithNormalizedExistingImports, ...importedTasks];
      persistTasks(tasks);
      return { tasks, selectedTaskId: firstActiveTaskId(tasks) };
    });

    return createdIds;
  },
  update: (id, draft, seguimientoText) => {
    set((state) => {
      const tasks = state.tasks.map((task) =>
        task.id === id ? buildUpdatedTask(task, draft, seguimientoText) : task,
      );
      persistTasks(tasks);
      const updatedTask = tasks.find((task) => task.id === id);
      return {
        tasks,
        selectedTaskId: updatedTask && isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id,
      };
    });
  },
  updateWithConcurrencyCheck: (id, draft, seguimientoText, expectedUpdatedAt, latestTasks) => {
    let result: TaskUpdateResult = {
      ok: false,
      message: 'No se ha podido guardar la tarea.',
    };

    set((state) => {
      const normalizedLatestTasks = latestTasks.map(normalizeTask);
      const latestTask = normalizedLatestTasks.find((task) => task.id === id);
      if (!latestTask) {
        result = {
          ok: false,
          message:
            'La tarea ya no existe en la base de datos compartida. Recarga antes de continuar.',
        };
        return {
          tasks: normalizedLatestTasks,
          selectedTaskId: firstActiveTaskId(normalizedLatestTasks),
        };
      }

      if (expectedUpdatedAt && latestTask.updatedAt !== expectedUpdatedAt) {
        result = {
          ok: false,
          message:
            'La tarea ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
        };
        return {
          tasks: normalizedLatestTasks,
          selectedTaskId: state.selectedTaskId,
        };
      }

      const tasks = normalizedLatestTasks.map((task) =>
        task.id === id ? buildUpdatedTask(task, draft, seguimientoText) : task,
      );
      persistTasks(tasks);
      const updatedTask = tasks.find((task) => task.id === id);
      result = { ok: true, message: 'Tarea guardada.' };
      return {
        tasks,
        selectedTaskId: updatedTask && isTaskClosed(updatedTask) ? firstActiveTaskId(tasks) : id,
      };
    });

    return result;
  },
  remove: (id) => {
    set((state) => {
      const now = new Date().toISOString();
      const tasks = state.tasks.map((task) => {
        if (task.id !== id) {
          return task;
        }

        addAuditEvent({
          module: 'tareas',
          entityId: task.id,
          action: 'deleted',
          summary: 'Registro eliminado',
          changes: [],
        });
        return { ...task, deletedAt: now, updatedAt: now };
      });
      persistTasks(tasks);
      return { tasks, selectedTaskId: firstActiveTaskId(tasks) };
    });
  },
  closeTasksFromCommittee: (taskIds, sessionLabel) => {
    useTaskStore.getState().closeTasksFromSession(taskIds, 'Comité de Empresa', sessionLabel);
  },
  closeTasksFromSession: (taskIds, moduleLabel, sessionLabel) => {
    set((state) => {
      const now = new Date().toISOString();
      const taskIdSet = new Set(taskIds);
      const seguimiento = buildSeguimiento(`Tratada en ${moduleLabel} (${sessionLabel}).`, now);
      const tasks = state.tasks.map((task) => {
        if (!taskIdSet.has(task.id) || task.deletedAt || isTaskClosed(task)) {
          return task;
        }

        addAuditEvent({
          module: 'tareas',
          entityId: task.id,
          action: 'status_changed',
          summary: `Estado cambiado: ${task.estado} → cerrada`,
          changes: [
            { field: 'estado', label: 'Estado', before: task.estado, after: 'cerrada' },
            { field: 'fase', label: 'Fase', before: task.fase, after: CLOSED_TASK_PHASE },
          ],
        });

        return {
          ...task,
          estado: 'cerrada' as const,
          fase: CLOSED_TASK_PHASE,
          seguimiento: [...seguimiento, ...task.seguimiento],
          closedAt: task.closedAt ?? now,
          updatedAt: now,
        };
      });
      persistTasks(tasks);
      return { tasks, selectedTaskId: firstActiveTaskId(tasks) };
    });
  },
  selectTask: (taskId) => set({ selectedTaskId: taskId }),
  setFilter: (key, value) => set((state) => ({ filters: { ...state.filters, [key]: value } })),
}));
