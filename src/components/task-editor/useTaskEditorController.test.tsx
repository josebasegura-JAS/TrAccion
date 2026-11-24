import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_TASK_DRAFT, type Task } from '../../features/tareas/domain/task';
import { useTaskEditorController } from './useTaskEditorController';

const mocks = vi.hoisted(() => {
  const load = vi.fn(async () => undefined);
  const create = vi.fn<(_draft: unknown, _tracking: unknown, id: string) => Promise<{ ok: boolean; message: string; recordId: string | undefined }>>(async () => ({ ok: false, message: 'Sin conexión', recordId: undefined }));
  const update = vi.fn(async () => ({ ok: false, message: 'Conflicto' }));
  const targets = vi.fn(async () => ({ ok: true, message: '' }));
  const taskState = { tasks: [] as Task[], createWithConcurrencyCheck: create, updateWithConcurrencyCheck: update, removeWithConcurrencyCheck: vi.fn() };
  const config = { taskPhases: [], taskOrigins: [], taskResponsibles: [], load };
  const coordination = { directionTaskIds: [], unionTaskIds: {}, areaTaskIds: {}, load, setTaskTargets: targets };
  const criteria = { criterios: [], load };
  return {
    create, update, targets, taskState, config, coordination, criteria,
    clearDraft: vi.fn(), done: vi.fn(), fresh: vi.fn(),
    lock: { status: 'acquired', isReadOnly: false, message: '' },
    liveLock: vi.fn(async () => ({ ok: true, status: 'acquired', message: '' })),
    createId: vi.fn(() => 'stable-id'),
    saveTracking: vi.fn<(payload: { id: string; value: string; expectedUpdatedAt: string | null }) => Promise<{ ok: boolean; message: string }>>(),
    readTracking: vi.fn(),
    audit: vi.fn(),
    confirm: vi.fn(async () => true),
  };
});
vi.mock('../../features/configuracion/store/useConfiguracionStore', () => ({
  useConfiguracionStore: (selector: (state: typeof mocks.config) => unknown) => selector(mocks.config),
}));
vi.mock('../../features/coordinacion/store/useCoordinacionStore', () => ({
  useCoordinacionStore: Object.assign((selector: (state: typeof mocks.coordination) => unknown) => selector(mocks.coordination), { getState: () => mocks.coordination }),
}));
vi.mock('../../features/tareas/store/useTaskStore', () => ({
  useTaskStore: Object.assign((selector: (state: typeof mocks.taskState) => unknown) => selector(mocks.taskState), {
    getState: () => mocks.taskState,
    setState: (updater: (state: typeof mocks.taskState) => Partial<typeof mocks.taskState>) => Object.assign(mocks.taskState, updater(mocks.taskState)),
  }),
}));
vi.mock('../../features/tareas/store/taskMutations', () => ({ createTaskId: mocks.createId }));
vi.mock('../../features/criterios-rrll/store/useCriteriosRrllStore', () => ({
  useCriteriosRrllStore: Object.assign((selector: (state: typeof mocks.criteria) => unknown) => selector(mocks.criteria), { getState: () => mocks.criteria }),
}));
vi.mock('../../features/criterios-rrll/domain/taskCriterionLinks', () => ({
  getCriterionIdForTask: vi.fn(async () => null), unlinkTaskCriterion: vi.fn(),
}));
vi.mock('../../services/useSharedRecordLock', () => ({ useSharedRecordLock: () => mocks.lock }));
vi.mock('./taskEditorLockSnapshot', () => ({
  loadFreshTaskAfterLock: mocks.fresh,
  hasUnsavedTaskEditorChanges: (current: unknown, baseline: unknown) => JSON.stringify(current) !== JSON.stringify(baseline),
}));
vi.mock('../../hooks/useEditorShortcuts', () => ({ useEditorShortcuts: vi.fn() }));
vi.mock('../../hooks/useRecoverableDraft', () => ({
  buildRecoverableDraftKey: (module: string, id: string) => module + ':' + id,
  useRecoverableDraft: () => ({ clearDraft: mocks.clearDraft, dialogNode: null }),
}));
vi.mock('../../hooks/useUnsavedChanges', () => ({ useUnsavedChanges: () => ({ requestClose: vi.fn(), dialogNode: null }) }));
vi.mock('../../hooks/useAppDialog', () => ({ useAppDialog: () => ({ confirm: mocks.confirm, dialogNode: null }) }));
vi.mock('../../shared/audit/auditTrail', () => ({ enqueueAuditEvent: mocks.audit }));
vi.mock('../../services/persistenceFeedback', () => ({ clearPersistenceBusy: vi.fn(), emitPersistenceFeedback: vi.fn(), publishPersistenceBusy: vi.fn() }));
vi.mock('../../features/tareas/domain/taskCreationNotifications', () => ({ markTaskCreationIdsSeen: vi.fn() }));

const task: Task = {
  ...EMPTY_TASK_DRAFT, id: 'task-1', titulo: 'Original', createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z', deletedAt: null, closedAt: null,
  sessionDocumentCode: '', sessionModule: '', sessionDate: '', seguimiento: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.taskState.tasks = [task];
  mocks.lock.status = 'acquired';
  mocks.lock.isReadOnly = false;
  mocks.fresh.mockResolvedValue(task);
  mocks.liveLock.mockResolvedValue({ ok: true, status: 'acquired', message: '' });
  mocks.create.mockResolvedValue({ ok: false, message: 'Sin conexión', recordId: undefined });
  mocks.update.mockResolvedValue({ ok: false, message: 'Conflicto' });
  mocks.targets.mockResolvedValue({ ok: true, message: '' });
  mocks.saveTracking.mockReset().mockResolvedValue({ ok: true, message: '' });
  mocks.readTracking.mockReset();
  mocks.confirm.mockReset().mockResolvedValue(true);
  vi.stubGlobal('traccion', { getRecordLock: mocks.liveLock, saveTaskRecordIfUnchanged: mocks.saveTracking, loadTaskRecords: mocks.readTracking });
});
afterEach(() => vi.unstubAllGlobals());

function createEditor() {
  return renderHook(() => useTaskEditorController({ task: null, mode: 'create', onDone: mocks.done, initialDraft: { titulo: 'Nueva tarea' } }));
}
async function editEditor() {
  const editor = renderHook(() => useTaskEditorController({ task, mode: 'edit', onDone: mocks.done }));
  await waitFor(() => expect(editor.result.current.isFormReadOnly).toBe(false));
  return editor;
}

describe('controlador de Tareas: protección del formulario', () => {
  it('no admite guardar sin título', async () => {
    const { result } = createEditor();
    act(() => result.current.setDraft(current => ({ ...current, titulo: '  ' })));
    expect(result.current.canSubmit).toBe(false);
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('conserva el borrador y el identificador de alta al reintentar un guardado fallido', async () => {
    const { result } = createEditor();
    act(() => result.current.setDraft(current => ({ ...current, descripcion: 'No perder' })));
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(result.current.draft.descripcion).toBe('No perder');
    expect(result.current.saveStatusIsError).toBe(true);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
    mocks.create.mockResolvedValueOnce({ ok: true, message: '', recordId: 'stable-id' });
    await act(async () => { expect(await result.current.handleSubmit()).toBe(true); });
    expect(mocks.createId).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls.map(call => call[2])).toEqual(['stable-id', 'stable-id']);
    expect(mocks.clearDraft).toHaveBeenCalledTimes(1);
    expect(mocks.done).toHaveBeenCalledTimes(1);
  });

  it('no borra el borrador si la tarea se guarda pero falla Coordinación', async () => {
    const { result } = createEditor();
    mocks.create.mockResolvedValueOnce({ ok: true, message: '', recordId: 'stable-id' });
    mocks.targets.mockResolvedValueOnce({ ok: false, message: 'Conflicto de circuito' });
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(result.current.saveStatus).toContain('Coordinación');
    expect(mocks.clearDraft).not.toHaveBeenCalled();
    expect(mocks.done).not.toHaveBeenCalled();
  });

  it('mantiene el editor en lectura hasta sincronizar la versión compartida', async () => {
    let resolveFresh!: (value: Task) => void;
    mocks.fresh.mockReturnValueOnce(new Promise<Task>(resolve => { resolveFresh = resolve; }));
    const { result } = renderHook(() => useTaskEditorController({ task, mode: 'edit', onDone: mocks.done }));
    expect(result.current.isFormReadOnly).toBe(true);
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(mocks.update).not.toHaveBeenCalled();
    await act(async () => resolveFresh({ ...task, titulo: 'Versión vigente', updatedAt: 'token-nuevo' }));
    expect(result.current.isFormReadOnly).toBe(false);
    expect(result.current.draft.titulo).toBe('Versión vigente');
    expect(result.current.loadedUpdatedAt).toBe('token-nuevo');
  });

  it('no sobrescribe cambios si pierde el bloqueo justo antes de guardar', async () => {
    const { result } = await editEditor();
    act(() => result.current.setDraft(current => ({ ...current, titulo: 'Mi borrador' })));
    mocks.liveLock.mockResolvedValueOnce({ ok: false, status: 'locked', message: 'Otro usuario' });
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(result.current.draft.titulo).toBe('Mi borrador');
    expect(result.current.saveStatus).toBe('Otro usuario');
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it('conserva el borrador y seguimiento si SQLite devuelve un conflicto OCC', async () => {
    const { result } = await editEditor();
    act(() => {
      result.current.setDraft(current => ({ ...current, titulo: 'Cambio local' }));
      result.current.setTrackingText('Seguimiento pendiente');
    });
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(mocks.update).toHaveBeenCalledWith(task.id, expect.objectContaining({ titulo: 'Cambio local' }), expect.stringContaining('Seguimiento pendiente'), task.updatedAt, undefined);
    expect(result.current.trackingText).toBe('Seguimiento pendiente');
    expect(result.current.saveStatusIsError).toBe(true);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it('no cierra ni limpia el formulario si falla el cierre de tarea', async () => {
    const { result } = await editEditor();
    await act(async () => { expect(await result.current.handleCloseTask()).toBe(false); });
    expect(mocks.update).toHaveBeenCalledWith(task.id, expect.objectContaining({ estado: 'cerrada', fase: 'cerrada' }), undefined, task.updatedAt);
    expect(mocks.done).not.toHaveBeenCalled();
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });

  it('no sustituye el borrador al recuperar un bloqueo perdido', async () => {
    const editor = await editEditor();
    act(() => editor.result.current.setDraft(current => ({ ...current, titulo: 'Mi borrador' })));
    mocks.lock.status = 'locked';
    mocks.lock.isReadOnly = true;
    editor.rerender();
    expect(editor.result.current.isFormReadOnly).toBe(true);
    mocks.fresh.mockResolvedValueOnce({ ...task, titulo: 'Cambio remoto' });
    mocks.lock.status = 'acquired';
    mocks.lock.isReadOnly = false;
    editor.rerender();
    await waitFor(() => expect(editor.result.current.lockMessage).toContain('cambios sin guardar'));
    expect(editor.result.current.draft.titulo).toBe('Mi borrador');
    expect(editor.result.current.isFormReadOnly).toBe(true);
    expect(mocks.clearDraft).not.toHaveBeenCalled();
  });
});

const trackingEntry = { id: 'tracking-1', fechaHora: '2026-11-01T00:00:00Z', texto: 'Texto original' };
const trackingTask: Task = { ...task, seguimiento: [trackingEntry] };

async function trackingEditor() {
  mocks.taskState.tasks = [trackingTask];
  mocks.fresh.mockResolvedValue(trackingTask);
  const editor = renderHook(() => useTaskEditorController({ task: trackingTask, mode: 'edit', onDone: mocks.done }));
  await waitFor(() => expect(editor.result.current.isFormReadOnly).toBe(false));
  act(() => editor.result.current.startTrackingEdit(trackingEntry, 0));
  act(() => editor.result.current.setEditingTrackingText('Texto corregido'));
  return editor;
}

function snapshot(persisted: Task) {
  return { status: { ready: true, phase: 'active' }, records: [{ id: persisted.id, value: JSON.stringify(persisted) }] };
}

function attemptedTask(): Task {
  const payload = mocks.saveTracking.mock.calls[0]?.[0];
  if (!payload) throw new Error('No se ha registrado un intento de guardado');
  return JSON.parse(payload.value) as Task;
}

describe('controlador de Tareas: seguimiento y resultados inciertos', () => {
  it('confirma la edición y conserva el identificador original del seguimiento', async () => {
    const { result } = await trackingEditor();
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    const saved = attemptedTask();
    expect(saved.seguimiento).toHaveLength(1);
    expect(saved.seguimiento[0]).toMatchObject({ id: trackingEntry.id, texto: expect.stringContaining('Texto corregido') });
    expect(saved.lastSaveAttemptId).toEqual(expect.any(String));
    expect(mocks.saveTracking).toHaveBeenCalledWith(expect.objectContaining({ expectedUpdatedAt: task.updatedAt }));
    expect(result.current.editingTrackingId).toBeNull();
    expect(result.current.loadedUpdatedAt).toBe(saved.updatedAt);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('conserva el texto si la escritura falla de forma definitiva', async () => {
    const { result } = await trackingEditor();
    mocks.saveTracking.mockResolvedValueOnce({ ok: false, message: 'Conflicto OCC' });
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(result.current.editingTrackingText).toBe('Texto corregido');
    expect(result.current.editingTrackingId).toBe(trackingEntry.id);
    expect(result.current.isSavingTrackingEdit).toBe(false);
    expect(result.current.saveStatusIsError).toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.taskState.tasks[0]).toEqual(trackingTask);
  });

  it.each(['throw', 'result'])('reconcilia un timeout confirmado sin duplicar escrituras (%s)', async (kind) => {
    const { result } = await trackingEditor();
    const message = 'resultado indeterminado';
    if (kind === 'throw') mocks.saveTracking.mockRejectedValueOnce(new Error(message));
    else mocks.saveTracking.mockResolvedValueOnce({ ok: false, message });
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(result.current.saveStatus).toContain('timeout');
    expect(mocks.audit).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.handleSubmit()).toBe(false); });
    expect(mocks.update).not.toHaveBeenCalled();
    const persisted = attemptedTask();
    mocks.readTracking.mockResolvedValueOnce(snapshot(persisted));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(mocks.readTracking).toHaveBeenCalledWith({ mode: 'all', id: task.id });
    expect(mocks.saveTracking).toHaveBeenCalledTimes(1);
    expect(result.current.saveStatus).toContain('No se ha duplicado');
    expect(result.current.editingTrackingId).toBeNull();
    expect(mocks.taskState.tasks[0]).toEqual(persisted);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it('no reenvía una escritura mientras no puede verificar el resultado', async () => {
    const { result } = await trackingEditor();
    mocks.saveTracking.mockRejectedValueOnce(new Error('resultado indeterminado'));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    mocks.readTracking.mockRejectedValueOnce(new Error('sin conexión'));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(result.current.editingTrackingText).toBe('Texto corregido');
    expect(result.current.saveStatus).toContain('No se puede comprobar');
    expect(mocks.saveTracking).toHaveBeenCalledTimes(1);
    mocks.readTracking.mockResolvedValueOnce(snapshot(attemptedTask()));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(result.current.editingTrackingId).toBeNull();
    expect(mocks.saveTracking).toHaveBeenCalledTimes(1);
  });

  it.each(['unchanged', 'remote'])('no reenvía automáticamente si SQLite no confirma el intento (%s)', async (kind) => {
    const { result } = await trackingEditor();
    mocks.saveTracking.mockRejectedValueOnce(new Error('resultado indeterminado'));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    mocks.readTracking.mockResolvedValueOnce(snapshot(kind === 'remote' ? { ...trackingTask, updatedAt: 'remote-token' } : trackingTask));
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(mocks.saveTracking).toHaveBeenCalledTimes(1);
    expect(result.current.editingTrackingText).toBe('Texto corregido');
    expect(result.current.saveStatus).toContain(kind === 'remote' ? 'otra versión' : 'no figura guardado');
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('cancelar la eliminación no escribe ni altera el seguimiento', async () => {
    const { result } = await trackingEditor();
    mocks.confirm.mockResolvedValueOnce(false);
    await act(async () => { await result.current.handleDeleteTracking(0); });
    expect(mocks.saveTracking).not.toHaveBeenCalled();
    expect(mocks.taskState.tasks[0]).toEqual(trackingTask);
  });

  it('rechaza la edición del seguimiento con una versión local obsoleta', async () => {
    const { result } = await trackingEditor();
    mocks.taskState.tasks = [{ ...trackingTask, updatedAt: 'remote-token' }];
    await act(async () => { await result.current.handleSaveTrackingEdit(trackingEntry, 0); });
    expect(mocks.saveTracking).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toContain('ha cambiado');
    expect(result.current.editingTrackingText).toBe('Texto corregido');
  });
});
