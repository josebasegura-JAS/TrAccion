import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMITE_SESSION_CONFIG } from '../../features/comite/domain/comite';
import { useCommitteeSessionStore } from '../../features/comite/store/useCommitteeSessionStore';
import { parseManagedSessionsSnapshot } from './createSessionStore';
import type { ManagedSessionDraft } from './session';

const timestamp = '2026-06-17T08:00:00.000Z';

function draft(overrides: Partial<ManagedSessionDraft> = {}): ManagedSessionDraft {
  return {
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Comité junio',
    notes: 'Notas',
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createManagedSessionStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useCommitteeSessionStore.setState({ sessions: [] });

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        getPersistedRecord: vi.fn(async (key: string) => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          record: { key, value: window.localStorage.getItem(key), updatedAt: 'storage-token-1' },
        })),
        saveLocalStorageRecordIfUnchanged: vi.fn(async ({ key, value }: { key: string; value: string }) => {
          window.localStorage.setItem(key, value);
          return { ok: true, status: { ready: true, phase: 'active', message: 'SQLite activo' }, message: 'Guardado' };
        }),
      },
    });
  });

  it('parsea snapshots corruptos o incompletos sin romper el arranque', () => {
    expect(parseManagedSessionsSnapshot(null, 'Comité')).toEqual([]);
    expect(parseManagedSessionsSnapshot('no-json', 'Comité')).toEqual([]);
    expect(parseManagedSessionsSnapshot(JSON.stringify([{ id: 'x' }]), 'Comité')).toEqual([]);
  });

  it('crea una sesión con comprobación de concurrencia y la persiste en almacenamiento compartido', async () => {
    const result = await useCommitteeSessionStore.getState().createWithConcurrencyCheck(draft());

    expect(result.ok).toBe(true);
    expect(result.sessionId).toBeDefined();
    expect(useCommitteeSessionStore.getState().sessions[0]).toMatchObject({
      date: '2026-06-17',
      code: 'CE-2026-06',
      title: 'Comité junio',
      status: 'open',
      items: [],
    });
    expect(JSON.parse(window.localStorage.getItem(COMITE_SESSION_CONFIG.storageKey) ?? '[]')).toHaveLength(1);
  });

  it('añade, reordena, quita y cierra tareas de una sesión abierta', async () => {
    const created = await useCommitteeSessionStore.getState().createWithConcurrencyCheck(draft());
    const sessionId = created.sessionId ?? '';

    await useCommitteeSessionStore.getState().addTaskWithConcurrencyCheck(sessionId, 'task-1', timestamp);
    let session = useCommitteeSessionStore.getState().sessions[0];
    await useCommitteeSessionStore.getState().addTaskWithConcurrencyCheck(sessionId, 'task-2', session.updatedAt);
    session = useCommitteeSessionStore.getState().sessions[0];
    await useCommitteeSessionStore.getState().moveTaskWithConcurrencyCheck(sessionId, 'task-2', 'up', session.updatedAt);

    expect(useCommitteeSessionStore.getState().sessions[0].items).toEqual(['task-2', 'task-1']);

    session = useCommitteeSessionStore.getState().sessions[0];
    await useCommitteeSessionStore.getState().removeTaskWithConcurrencyCheck(sessionId, 'task-1', session.updatedAt);
    expect(useCommitteeSessionStore.getState().sessions[0].items).toEqual(['task-2']);

    session = useCommitteeSessionStore.getState().sessions[0];
    await useCommitteeSessionStore.getState().closeSessionWithConcurrencyCheck(sessionId, ['task-2'], session.updatedAt);
    expect(useCommitteeSessionStore.getState().sessions[0]).toMatchObject({
      status: 'closed',
      treatedTaskIds: ['task-2'],
      untreatedTaskIds: [],
      closedAt: timestamp,
    });
  });

  it('importa sesiones históricas una sola vez por clave externa o código-fecha', async () => {
    const first = await useCommitteeSessionStore.getState().importSessionsWithConcurrencyCheck([
      { externalKey: 'CE:2025-05-21:1', draft: draft({ date: '2025-05-21', code: 'CE-2025-05' }), taskIds: ['task-1'] },
    ]);
    const second = await useCommitteeSessionStore.getState().importSessionsWithConcurrencyCheck([
      { externalKey: 'CE:2025-05-21:1', draft: draft({ date: '2025-05-21', code: 'CE-2025-05' }), taskIds: ['task-2'] },
    ]);

    expect(first.importedCount).toBe(1);
    expect(second.importedCount).toBe(0);
    expect(useCommitteeSessionStore.getState().sessions).toHaveLength(1);
    expect(useCommitteeSessionStore.getState().sessions[0]).toMatchObject({
      status: 'closed',
      items: ['task-1'],
      treatedTaskIds: ['task-1'],
    });
  });

  it('rechaza updateWithConcurrencyCheck cuando otro usuario ha modificado la sesión entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const created = await useCommitteeSessionStore.getState().createWithConcurrencyCheck(draft());
    const sessionId = created.sessionId ?? '';
    const sessionAfterCreate = useCommitteeSessionStore.getState().sessions[0];
    const staleExpectedUpdatedAt = sessionAfterCreate.updatedAt;

    // Simula que, entre que este cliente leyó la sesión y decidió guardar,
    // otro usuario ya la modificó: el blob compartido en localStorage pasa a
    // contener la sesión con un updatedAt distinto al que este cliente espera.
    const storedSessions = JSON.parse(
      window.localStorage.getItem(COMITE_SESSION_CONFIG.storageKey) ?? '[]',
    ) as Array<Record<string, unknown>>;
    const sessionsAfterOtherUserEdit = storedSessions.map((session) =>
      session.id === sessionId
        ? { ...session, title: 'Comité junio (otro usuario)', updatedAt: '2026-06-17T08:05:00.000Z' }
        : session,
    );
    window.localStorage.setItem(COMITE_SESSION_CONFIG.storageKey, JSON.stringify(sessionsAfterOtherUserEdit));

    const result = await useCommitteeSessionStore.getState().updateWithConcurrencyCheck(
      sessionId,
      draft({ title: 'Comité junio (editado)' }),
      staleExpectedUpdatedAt,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificad[ao] por otro usuario/i);
    // El cambio local NO debe haberse aplicado: el conflicto impide guardar
    // sobre un registro que ya cambió en la base compartida. El estado en
    // memoria conserva el valor previo a este intento (ni el cambio fallido
    // ni la edición del otro usuario se reflejan hasta el próximo reload).
    expect(useCommitteeSessionStore.getState().sessions[0].title).toBe('Comité junio');
  });

  it('permite updateWithConcurrencyCheck cuando expectedUpdatedAt coincide con el valor vigente', async () => {
    const created = await useCommitteeSessionStore.getState().createWithConcurrencyCheck(draft());
    const sessionId = created.sessionId ?? '';
    const sessionAfterCreate = useCommitteeSessionStore.getState().sessions[0];

    const result = await useCommitteeSessionStore.getState().updateWithConcurrencyCheck(
      sessionId,
      draft({ title: 'Comité junio (editado)' }),
      sessionAfterCreate.updatedAt,
    );

    expect(result.ok).toBe(true);
    expect(useCommitteeSessionStore.getState().sessions[0].title).toBe('Comité junio (editado)');
  });
});
