from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if old not in text:
        raise RuntimeError(f'Anchor not found in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')


def insert_before(path: str, marker: str, content: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    if marker not in text:
        raise RuntimeError(f'Marker not found in {path}: {marker[:120]!r}')
    p.write_text(text.replace(marker, content + marker, 1), encoding='utf-8')

# 1) Build new tasks in one shared helper so regular creation and atomic Coordinacion creation cannot diverge.
replace_once(
    'src/features/tareas/store/taskMutations.ts',
    "export function buildSeguimiento(text: string | undefined, fechaHora: string): TaskSeguimientoEntry[] {\n  const trimmedText = text?.trim();\n  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];\n}\n\n",
    "export function buildSeguimiento(text: string | undefined, fechaHora: string): TaskSeguimientoEntry[] {\n  const trimmedText = text?.trim();\n  return trimmedText ? [{ fechaHora, texto: trimmedText }] : [];\n}\n\nexport function buildNewTask(\n  draft: TaskDraft,\n  seguimientoText: string | undefined,\n  options?: { now?: string; taskId?: string },\n): Task {\n  const now = options?.now ?? new Date().toISOString();\n  const taskId = options?.taskId ?? createTaskId();\n  return {\n    id: taskId,\n    ...draft,\n    ...buildAssignmentNoticeFields(taskId, '', draft.responsable, now),\n    sessionDocumentCode: '',\n    sessionModule: '',\n    sessionDate: '',\n    seguimiento: buildSeguimiento(seguimientoText, now),\n    createdAt: now,\n    updatedAt: now,\n    deletedAt: null,\n    closedAt: isTaskClosed(draft) ? now : null,\n  };\n}\n\n",
)

replace_once(
    'src/features/tareas/store/taskCrud.ts',
    "  buildAssignmentNoticeFields,\n  buildSeguimiento,\n  buildUpdatedTask,\n  createTaskId,\n",
    "  buildNewTask,\n  buildUpdatedTask,\n  createTaskId,\n",
)
replace_once(
    'src/features/tareas/store/taskCrud.ts',
    "  const now = new Date().toISOString();\n  const taskId = createTaskId();\n  const task: Task = {\n    id: taskId,\n    ...draft,\n    ...buildAssignmentNoticeFields(taskId, '', draft.responsable, now),\n    sessionDocumentCode: '',\n    sessionModule: '',\n    sessionDate: '',\n    seguimiento: buildSeguimiento(seguimientoText, now),\n    createdAt: now,\n    updatedAt: now,\n    deletedAt: null,\n    closedAt: isTaskClosed(draft) ? now : null,\n  };\n",
    "  const task = buildNewTask(draft, seguimientoText);\n",
)

# 2) Allow TaskEditor creation to be delegated to a context-specific atomic creator.
replace_once(
    'src/components/task-editor/useTaskEditorController.ts',
    "export type TaskEditorControllerArgs = {\n  task: Task | null;\n  mode: 'create' | 'edit';\n  onDone: () => void;\n  initialDraft?: Partial<TaskDraft>;\n  initialTrackingText?: string;\n  onCreated?: (taskId: string) => void | Promise<void>;\n};\n",
    "export type TaskCreateOverrideInput = {\n  draft: TaskDraft;\n  seguimientoText?: string;\n  targets: { direction: boolean; unionName: string | null; areaName: string | null };\n};\n\nexport type TaskCreateOverride = (input: TaskCreateOverrideInput) => Promise<{\n  ok: boolean;\n  message: string;\n  recordId?: string;\n}>;\n\nexport type TaskEditorControllerArgs = {\n  task: Task | null;\n  mode: 'create' | 'edit';\n  onDone: () => void;\n  initialDraft?: Partial<TaskDraft>;\n  initialTrackingText?: string;\n  onCreated?: (taskId: string) => void | Promise<void>;\n  createTaskOverride?: TaskCreateOverride;\n};\n",
)
replace_once(
    'src/components/task-editor/useTaskEditorController.ts',
    "  initialTrackingText = '',\n  onCreated,\n}: TaskEditorControllerArgs) {",
    "  initialTrackingText = '',\n  onCreated,\n  createTaskOverride,\n}: TaskEditorControllerArgs) {",
)
replace_once(
    'src/components/task-editor/useTaskEditorController.ts',
    "    if (isCreate) {\n      const result = await createTask(draft, seguimientoForSave);\n      if (!result.ok) {\n        setSaveStatus(result.message);\n        setSaveStatusIsError(true);\n        return;\n      }\n      if (result.recordId) {\n        // La tarea recién creada no debe aparecer como \"nueva\" al propio creador.\n        // El visto es local por usuario, por lo que el resto del equipo sí recibirá el aviso azul.\n        markTaskCreationIdsSeen(trackingUser, [result.recordId]);\n        const coordinationResult = await updateCoordinationTargets(result.recordId);\n        if (!coordinationResult.ok) {\n          setSaveStatus(`Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);\n          setSaveStatusIsError(true);\n          return;\n        }\n        await onCreated?.(result.recordId);\n      }\n      clearRecoveryDraft();\n      onDone();\n      return;\n    }",
    "    if (isCreate) {\n      const targets = {\n        direction: sendToDirection,\n        unionName: sendToUnion && selectedUnionOrigin ? selectedUnionOrigin.nombre : null,\n        areaName: selectedAreaTarget || null,\n      };\n      const result = createTaskOverride\n        ? await createTaskOverride({ draft, seguimientoText: seguimientoForSave, targets })\n        : await createTask(draft, seguimientoForSave);\n      if (!result.ok) {\n        setSaveStatus(result.message);\n        setSaveStatusIsError(true);\n        return;\n      }\n      if (result.recordId) {\n        // La tarea recién creada no debe aparecer como \"nueva\" al propio creador.\n        // El visto es local por usuario, por lo que el resto del equipo sí recibirá el aviso azul.\n        markTaskCreationIdsSeen(trackingUser, [result.recordId]);\n        if (!createTaskOverride) {\n          const coordinationResult = await updateCoordinationTargets(result.recordId);\n          if (!coordinationResult.ok) {\n            setSaveStatus(`Tarea guardada, pero no se ha podido actualizar Coordinación: ${coordinationResult.message}`);\n            setSaveStatusIsError(true);\n            return;\n          }\n        }\n        await onCreated?.(result.recordId);\n      }\n      clearRecoveryDraft();\n      onDone();\n      return;\n    }",
)

replace_once(
    'src/components/TaskEditor.tsx',
    "import { useTaskEditorController } from './task-editor/useTaskEditorController';",
    "import { useTaskEditorController, type TaskCreateOverride } from './task-editor/useTaskEditorController';",
)
replace_once(
    'src/components/TaskEditor.tsx',
    "  onCreated,\n}: {\n  task: Task | null;\n  mode: 'create' | 'edit';\n  onDone: () => void;\n  initialDraft?: Partial<TaskDraft>;\n  initialTrackingText?: string;\n  onCreated?: (taskId: string) => void | Promise<void>;\n}) {",
    "  onCreated,\n  createTaskOverride,\n}: {\n  task: Task | null;\n  mode: 'create' | 'edit';\n  onDone: () => void;\n  initialDraft?: Partial<TaskDraft>;\n  initialTrackingText?: string;\n  onCreated?: (taskId: string) => void | Promise<void>;\n  createTaskOverride?: TaskCreateOverride;\n}) {",
)
replace_once(
    'src/components/TaskEditor.tsx',
    "  } = useTaskEditorController({ task, mode, onDone, initialDraft, initialTrackingText, onCreated });",
    "  } = useTaskEditorController({ task, mode, onDone, initialDraft, initialTrackingText, onCreated, createTaskOverride });",
)

# 3) Atomic renderer workflow for task creation + meeting/index link.
service = r'''import { applyConfirmedPersistedRecord, readStorageItem } from '../../../services/persistence';
import { enqueueAuditEvent } from '../../../shared/audit/auditTrail';
import { isTaskClosed, type TaskDraft } from '../../tareas/domain/task';
import { firstActiveTaskId, normalizeTask } from '../../tareas/store/taskNormalization';
import { buildNewTask } from '../../tareas/store/taskMutations';
import type { TaskUpdateResult } from '../../tareas/store/taskPersistence';
import { useTaskStore } from '../../tareas/store/useTaskStore';
import { createCoordinationId, type CoordinationPoint, type CoordinationState } from '../domain/coordinacion';
import { useCoordinacionStore } from '../store/useCoordinacionStore';
import { updateTaskTargets } from './coordinationTaskTargets';
import {
  COORDINATION_INDEX_STORAGE_KEY,
  coordinationIndexFromState,
  coordinationMeetingStorageKey,
  readCoordinationState,
} from './coordinationPersistence';

export interface CoordinationTaskCreationInput {
  meetingId: string;
  pointId: string | null;
  draft: TaskDraft;
  seguimientoText?: string;
  targets: { direction: boolean; unionName: string | null; areaName: string | null };
}

function withLinkedTask(
  current: CoordinationState,
  meetingId: string,
  pointId: string | null,
  task: ReturnType<typeof buildNewTask>,
  now: string,
): CoordinationState | null {
  const meeting = current.meetings.find((candidate) => candidate.id === meetingId);
  if (!meeting || meeting.status === 'closed') return null;

  let points: CoordinationPoint[];
  if (pointId) {
    const point = meeting.points.find((candidate) => candidate.id === pointId);
    if (!point || point.origin !== 'manual') return null;
    points = meeting.points.map((candidate) => candidate.id === pointId ? {
      ...candidate,
      origin: 'task',
      taskId: task.id,
      updatedAt: now,
    } : candidate);
  } else {
    points = [...meeting.points, {
      id: createCoordinationId('task-point'),
      origin: 'task',
      taskId: task.id,
      title: task.titulo,
      detail: task.descripcion,
      result: '',
      status: 'pendiente',
      responsible: '',
      dueDate: '',
      createdAt: now,
      updatedAt: now,
    }];
  }

  return {
    ...current,
    meetings: current.meetings.map((candidate) => candidate.id === meetingId ? {
      ...candidate,
      points,
      updatedAt: now,
    } : candidate),
  };
}

export async function createAndLinkCoordinationTaskAtomically(
  input: CoordinationTaskCreationInput,
): Promise<TaskUpdateResult> {
  const api = window.traccion;
  if (!api?.getPersistedRecord || !api.createCoordinationTaskAtomically) {
    return { ok: false, message: 'La versión actual no expone la creación atómica de tareas desde Coordinación.' };
  }

  const current = readCoordinationState();
  const meeting = current.meetings.find((candidate) => candidate.id === input.meetingId);
  if (!meeting) return { ok: false, message: 'No se ha encontrado la reunión.' };
  if (meeting.status === 'closed') return { ok: false, message: 'La reunión está cerrada y no admite nuevas tareas.' };
  if (input.pointId) {
    const point = meeting.points.find((candidate) => candidate.id === input.pointId);
    if (!point || point.origin !== 'manual') {
      return { ok: false, message: 'El punto manual ya no está disponible para convertirlo en tarea.' };
    }
  }

  const now = new Date().toISOString();
  const task = normalizeTask(buildNewTask(input.draft, input.seguimientoText, { now }));
  const targetedState = updateTaskTargets(current, task.id, input.targets);
  const nextState = withLinkedTask(targetedState, input.meetingId, input.pointId, task, now);
  const nextMeeting = nextState?.meetings.find((candidate) => candidate.id === input.meetingId);
  if (!nextState || !nextMeeting) {
    return { ok: false, message: 'No se ha podido preparar el vínculo entre la tarea y la reunión.' };
  }

  const meetingKey = coordinationMeetingStorageKey(input.meetingId);
  const currentMeetingValue = readStorageItem(meetingKey);
  const currentIndexValue = readStorageItem(COORDINATION_INDEX_STORAGE_KEY);
  if (!currentMeetingValue || !currentIndexValue) {
    return { ok: false, message: 'Coordinación no está sincronizada con SQLite. Recarga antes de crear la tarea.' };
  }

  const [meetingSnapshot, indexSnapshot] = await Promise.all([
    api.getPersistedRecord(meetingKey),
    api.getPersistedRecord(COORDINATION_INDEX_STORAGE_KEY),
  ]);
  if (
    !meetingSnapshot.record || meetingSnapshot.record.value !== currentMeetingValue ||
    !indexSnapshot.record || indexSnapshot.record.value !== currentIndexValue
  ) {
    return { ok: false, message: 'Coordinación ha cambiado en otro equipo. Recarga antes de crear la tarea.' };
  }

  const meetingValue = JSON.stringify(nextMeeting);
  const indexValue = JSON.stringify(coordinationIndexFromState(nextState));
  const result = await api.createCoordinationTaskAtomically({
    meeting: { key: meetingKey, value: meetingValue, expectedUpdatedAt: meetingSnapshot.record.updatedAt },
    index: { key: COORDINATION_INDEX_STORAGE_KEY, value: indexValue, expectedUpdatedAt: indexSnapshot.record.updatedAt },
    task: { id: task.id, value: JSON.stringify(task) },
  });
  if (!result.ok || !result.meetingUpdatedAt || !result.indexUpdatedAt) {
    return { ok: false, message: result.message || 'No se ha podido crear y vincular la tarea de forma atómica.' };
  }

  applyConfirmedPersistedRecord(meetingKey, meetingValue, result.meetingUpdatedAt);
  applyConfirmedPersistedRecord(COORDINATION_INDEX_STORAGE_KEY, indexValue, result.indexUpdatedAt);
  useCoordinacionStore.setState(nextState);
  useTaskStore.setState((state) => {
    const tasks = [...state.tasks.filter((candidate) => candidate.id !== task.id), task];
    return {
      tasks,
      selectedTaskId: isTaskClosed(task) ? firstActiveTaskId(tasks) : task.id,
    };
  });
  enqueueAuditEvent({ module: 'tareas', entityId: task.id, action: 'created', summary: 'Registro creado', changes: [] });
  return { ok: true, message: result.message, recordId: task.id };
}
'''
Path('src/features/coordinacion/services/coordinationTaskCreation.ts').write_text(service, encoding='utf-8')

# 4) Wire CoordinacionPage to the atomic creator and make onCreated post-commit only.
replace_once(
    'src/features/coordinacion/components/CoordinacionPage.tsx',
    "import { registerTaskUpdateAudit } from '../../tareas/store/taskMutations';",
    "import { registerTaskUpdateAudit } from '../../tareas/store/taskMutations';\nimport { createAndLinkCoordinationTaskAtomically } from '../services/coordinationTaskCreation';",
)
replace_once(
    'src/features/coordinacion/components/CoordinacionPage.tsx',
    "  const handleCreatedTask = async (taskId: string) => {\n    if (!selected) return;\n    const currentTasks = useTaskStore.getState().tasks;\n    const result = taskCreation?.pointId\n      ? await linkManualPointToTask(selected.id, taskCreation.pointId, taskId, currentTasks)\n      : await addTaskPoint(selected.id, taskId, currentTasks);\n    setStatus(result.ok\n      ? taskCreation?.pointId ? 'Punto convertido en tarea y vinculado a la reunión.' : 'Tarea creada y añadida a la reunión.'\n      : `La tarea se ha creado, pero no ha podido vincularse a la reunión: ${result.message}`);\n    if (result.ok) await backup();\n  };",
    "  const handleCreateTaskFromCoordination = (input: {\n    draft: TaskDraft;\n    seguimientoText?: string;\n    targets: { direction: boolean; unionName: string | null; areaName: string | null };\n  }) => {\n    if (!selected) return Promise.resolve({ ok: false, message: 'No hay una reunión activa para vincular la tarea.' });\n    return createAndLinkCoordinationTaskAtomically({\n      meetingId: selected.id,\n      pointId: taskCreation?.pointId ?? null,\n      ...input,\n    });\n  };\n\n  const handleCreatedTask = async () => {\n    setStatus(taskCreation?.pointId\n      ? 'Punto convertido en tarea y vinculado a la reunión.'\n      : 'Tarea creada y añadida a la reunión.');\n    await backup();\n  };",
)
replace_once(
    'src/features/coordinacion/components/CoordinacionPage.tsx',
    "{taskCreation && <TaskEditor initialDraft={taskInitialDraft} initialTrackingText={taskInitialTrackingText} key={`meeting-task-${taskCreation.pointId ?? 'new'}`} mode=\"create\" onCreated={handleCreatedTask} onDone={() => setTaskCreation(null)} task={null} />}",
    "{taskCreation && <TaskEditor createTaskOverride={handleCreateTaskFromCoordination} initialDraft={taskInitialDraft} initialTrackingText={taskInitialTrackingText} key={`meeting-task-${taskCreation.pointId ?? 'new'}`} mode=\"create\" onCreated={handleCreatedTask} onDone={() => setTaskCreation(null)} task={null} />}",
)

# 5) Electron transaction + IPC/preload typings.
replace_once(
    'electron/sqlitePersistence.ts',
    "export interface AtomicCoordinationWorkflowResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  message: string;\n  meetingUpdatedAt?: string;\n  indexUpdatedAt?: string;\n}\n",
    "export interface AtomicCoordinationWorkflowResult {\n  ok: boolean;\n  status: DatabaseStatus;\n  message: string;\n  meetingUpdatedAt?: string;\n  indexUpdatedAt?: string;\n}\n\nexport interface AtomicCoordinationTaskCreationPayload {\n  meeting: AtomicCoordinationWorkflowRecord;\n  index: AtomicCoordinationWorkflowRecord;\n  task: { id: string; value: string };\n}\n\nexport type AtomicCoordinationTaskCreationResult = AtomicCoordinationWorkflowResult;\n",
)

atomic_fn = r'''
export async function createCoordinationTaskAtomically(
  payload: AtomicCoordinationTaskCreationPayload,
): Promise<AtomicCoordinationTaskCreationResult> {
  return safeDatabaseOperation(
    () => {
      const currentStatus = getSqliteStatus();
      if (!currentStatus.ready || currentStatus.phase !== 'active' || isDatabaseWriteBlockedByHeartbeat()) {
        return {
          ok: false,
          status: currentStatus,
          message: currentStatus.message ?? 'SQLite no está activo. No se puede crear la tarea desde Coordinación de forma segura.',
        };
      }

      assertDatabaseWritesAllowed();
      const db = requireDatabase();
      const result = db.transaction((): AtomicCoordinationTaskCreationResult => {
        const readPersistedUpdatedAt = (key: string): string | null => {
          const row = db.prepare('SELECT updated_at FROM persisted_records WHERE key = ?').get(key) as { updated_at?: unknown } | undefined;
          return typeof row?.updated_at === 'string' ? row.updated_at : null;
        };
        if (readPersistedUpdatedAt(payload.meeting.key) !== payload.meeting.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'La reunión ha sido modificada por otro usuario. Recarga antes de crear la tarea.' };
        }
        if (readPersistedUpdatedAt(payload.index.key) !== payload.index.expectedUpdatedAt) {
          return { ok: false, status: currentStatus, message: 'Coordinación ha sido modificada por otro usuario. Recarga antes de crear la tarea.' };
        }
        const existingTask = db.prepare('SELECT id FROM task_records WHERE id = ?').get(payload.task.id);
        if (existingTask) {
          return { ok: false, status: currentStatus, message: 'La tarea ya existe. Recarga antes de volver a intentarlo.' };
        }

        const now = new Date().toISOString();
        const updatePersisted = (record: AtomicCoordinationWorkflowRecord): void => {
          const update = db.prepare(
            `UPDATE persisted_records
             SET value_json = ?, source = 'sqlite-primary', updated_at = ?
             WHERE key = ? AND updated_at = ?`,
          ).run(record.value, now, record.key, record.expectedUpdatedAt);
          if (update.changes !== 1) throw new Error('Conflicto de concurrencia al vincular la nueva tarea con Coordinación.');
        };

        let parsed: Record<string, unknown> = {};
        try {
          const candidate = JSON.parse(payload.task.value);
          if (candidate && typeof candidate === 'object') parsed = candidate as Record<string, unknown>;
        } catch {
          // El renderer ya ha validado la estructura funcional de la tarea.
        }
        const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : now;
        const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now;
        const deletedAt = typeof parsed.deletedAt === 'string' ? parsed.deletedAt : null;

        updatePersisted(payload.meeting);
        updatePersisted(payload.index);
        const insert = db.prepare(
          `INSERT INTO task_records (id, value_json, created_at, updated_at, deleted_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(payload.task.id, payload.task.value, createdAt, updatedAt, deletedAt);
        if (insert.changes !== 1) throw new Error('No se ha podido crear la tarea vinculada a Coordinación.');

        updateRefreshMetadata(db, now);
        return {
          ok: true,
          status: currentStatus,
          message: 'Tarea creada y vinculada a Coordinación de forma atómica.',
          meetingUpdatedAt: now,
          indexUpdatedAt: now,
        };
      })();

      if (result.ok) enqueueLocalBackup('create:coordinacion_task_workflow');
      return result;
    },
    (nextStatus, message) => ({ ok: false, status: nextStatus, message }),
  );
}

'''
insert_before('electron/sqlitePersistence.ts', 'const taskModule = createTaskRepository({', atomic_fn)

replace_once(
    'electron/ipc/registerSesionesIpc.ts',
    "  closeCoordinationWorkflowAtomically,\n} from '../sqlitePersistence.js';",
    "  closeCoordinationWorkflowAtomically,\n  createCoordinationTaskAtomically,\n} from '../sqlitePersistence.js';",
)
replace_once(
    'electron/ipc/registerSesionesIpc.ts',
    "  ipcMain.handle('coordinacion:close-workflow-atomically', (_event, payload: unknown) => {",
    "  ipcMain.handle('coordinacion:create-task-atomically', (_event, payload: unknown) => {\n    if (!payload || typeof payload !== 'object') {\n      return { ok: false, status: getSqliteStatus(), message: 'Payload de creación de tarea desde Coordinación inválido.' };\n    }\n    return enqueueSqliteIpc('coordinacion:create-task-atomically', () =>\n      createCoordinationTaskAtomically(payload as Parameters<typeof createCoordinationTaskAtomically>[0]),\n    );\n  });\n\n  ipcMain.handle('coordinacion:close-workflow-atomically', (_event, payload: unknown) => {",
)

replace_once(
    'electron/preload.cts',
    "  closeCoordinationWorkflowAtomically: (payload: {\n    meeting: { key: string; value: string; expectedUpdatedAt: string };\n    index: { key: string; value: string; expectedUpdatedAt: string };\n    tasks: Array<{ id: string; value: string; expectedUpdatedAt: string | null }>;\n  }) => ipcRenderer.invoke('coordinacion:close-workflow-atomically', payload),",
    "  createCoordinationTaskAtomically: (payload: {\n    meeting: { key: string; value: string; expectedUpdatedAt: string };\n    index: { key: string; value: string; expectedUpdatedAt: string };\n    task: { id: string; value: string };\n  }) => ipcRenderer.invoke('coordinacion:create-task-atomically', payload),\n  closeCoordinationWorkflowAtomically: (payload: {\n    meeting: { key: string; value: string; expectedUpdatedAt: string };\n    index: { key: string; value: string; expectedUpdatedAt: string };\n    tasks: Array<{ id: string; value: string; expectedUpdatedAt: string | null }>;\n  }) => ipcRenderer.invoke('coordinacion:close-workflow-atomically', payload),",
)
replace_once(
    'src/vite-env.d.ts',
    "  closeCoordinationWorkflowAtomically?: (payload: { meeting: { key: string; value: string; expectedUpdatedAt: string }; index: { key: string; value: string; expectedUpdatedAt: string }; tasks: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> }) => Promise<{ ok: boolean; message: string; meetingUpdatedAt?: string; indexUpdatedAt?: string }>;;",
    "  createCoordinationTaskAtomically?: (payload: { meeting: { key: string; value: string; expectedUpdatedAt: string }; index: { key: string; value: string; expectedUpdatedAt: string }; task: { id: string; value: string } }) => Promise<{ ok: boolean; message: string; meetingUpdatedAt?: string; indexUpdatedAt?: string }>;;\n  closeCoordinationWorkflowAtomically?: (payload: { meeting: { key: string; value: string; expectedUpdatedAt: string }; index: { key: string; value: string; expectedUpdatedAt: string }; tasks: Array<{ id: string; value: string; expectedUpdatedAt: string | null }> }) => Promise<{ ok: boolean; message: string; meetingUpdatedAt?: string; indexUpdatedAt?: string }>;;",
)

# The source has single semicolons; normalize script anchors/generation before executing if needed.

# 6) Backend atomicity tests: success and stale-meeting rollback.
test_path = Path('electron/sqlitePersistence.coordinationOcc.test.ts')
test_text = test_path.read_text(encoding='utf-8')
marker = '\n});\n'
if not test_text.endswith(marker):
    raise RuntimeError('Unexpected coordination OCC test ending')
extra = r'''
  it('crea la tarea y la vincula con reunión e índice en una única transacción', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-create-task';
    const indexKey = 'traccion.v1.coordinacion.index';
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: JSON.stringify({ id: 'meeting-create-task', points: [] }), expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-task'], directionTaskIds: [] }), expectedUpdatedAt: null });
    expect(meeting.ok && index.ok).toBe(true);

    const taskValue = JSON.stringify({ id: 'task-created-atomic', titulo: 'Nueva', updatedAt: '2026-10-14T06:00:00.000Z', createdAt: '2026-10-14T06:00:00.000Z', deletedAt: null });
    const result = await persistence.createCoordinationTaskAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-create-task', points: [{ taskId: 'task-created-atomic' }] }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-task'], directionTaskIds: ['task-created-atomic'] }), expectedUpdatedAt: index.currentUpdatedAt! },
      task: { id: 'task-created-atomic', value: taskValue },
    });

    expect(result.ok).toBe(true);
    expect((await persistence.getPersistedRecordSnapshot(meetingKey)).record?.value).toContain('task-created-atomic');
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toContain('task-created-atomic');
    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.find((record) => record.id === 'task-created-atomic')?.value).toBe(taskValue);
    await persistence.closeSqlitePersistence();
  });

  it('si la reunión cambió no crea la tarea ni modifica el índice', async () => {
    createSharedDatabase(layout.databasePath);
    writePreferences(layout.userData, layout.sharedDirectory);
    const persistence = await import('./sqlitePersistence.js');
    await persistence.initializeSqlitePersistence();

    const meetingKey = 'traccion.v1.coordinacion.meeting.meeting-create-conflict';
    const indexKey = 'traccion.v1.coordinacion.index';
    const initialMeeting = JSON.stringify({ id: 'meeting-create-conflict', points: [] });
    const initialIndex = JSON.stringify({ meetingIds: ['meeting-create-conflict'], directionTaskIds: [] });
    const meeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: initialMeeting, expectedUpdatedAt: null });
    const index = await persistence.savePersistedRecordIfUnchanged({ key: indexKey, value: initialIndex, expectedUpdatedAt: null });
    const newerMeeting = await persistence.savePersistedRecordIfUnchanged({ key: meetingKey, value: JSON.stringify({ id: 'meeting-create-conflict', points: [{ id: 'remote' }] }), expectedUpdatedAt: meeting.currentUpdatedAt });
    expect(newerMeeting.ok).toBe(true);

    const result = await persistence.createCoordinationTaskAtomically({
      meeting: { key: meetingKey, value: JSON.stringify({ id: 'meeting-create-conflict', points: [{ taskId: 'task-should-not-exist' }] }), expectedUpdatedAt: meeting.currentUpdatedAt! },
      index: { key: indexKey, value: JSON.stringify({ meetingIds: ['meeting-create-conflict'], directionTaskIds: ['task-should-not-exist'] }), expectedUpdatedAt: index.currentUpdatedAt! },
      task: { id: 'task-should-not-exist', value: JSON.stringify({ id: 'task-should-not-exist', createdAt: '2026-10-14T06:00:00.000Z', updatedAt: '2026-10-14T06:00:00.000Z', deletedAt: null }) },
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('reunión');
    expect((await persistence.getPersistedRecordSnapshot(indexKey)).record?.value).toBe(initialIndex);
    const tasks = await persistence.loadTaskRecordsSnapshot({ mode: 'all' });
    expect(tasks.records.some((record) => record.id === 'task-should-not-exist')).toBe(false);
    await persistence.closeSqlitePersistence();
  });
'''
test_path.write_text(test_text[:-len(marker)] + '\n' + extra + marker, encoding='utf-8')

print('PR4 transformations applied')
