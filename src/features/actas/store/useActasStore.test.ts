import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';
import { EMPTY_ACTA_DRAFT, type Acta, type ActaDraft, type ActaState } from '../domain/acta';
import { ACTAS_STORAGE_KEY, useActasStore } from './useActasStore';

const ACTA_TYPES_STORAGE_KEY = 'traccion.v1.actas.types';
const timestamp = '2026-06-17T08:00:00.000Z';

function draft(overrides: Partial<ActaDraft> = {}): ActaDraft {
  return {
    ...EMPTY_ACTA_DRAFT,
    titulo: 'Acta CE junio',
    tipo: 'Comité',
    fechaSesion: '2026-06-17',
    fechaLimite: '2026-06-24',
    observaciones: 'Observaciones iniciales',
    ...overrides,
  };
}

function session(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    id: 'session-1',
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Comité junio',
    notes: 'Notas sesión',
    status: 'closed',
    items: ['task-1'],
    treatedTaskIds: ['task-1'],
    untreatedTaskIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: timestamp,
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Punto tratado',
    descripcion: '',
    tipo: 'interna',
    fase: 'comite',
    estado: 'cerrada',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origen: '',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    seguimiento: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}


function installFakePersistedRecordsBackend(): void {
  const store = new Map<string, { value: string; updatedAt: string }>();
  const status = { ready: true, phase: 'active' as const };

  Object.defineProperty(window, 'traccion', {
    configurable: true,
    value: {
      getPersistedRecord: vi.fn(async (key: string) => {
        const entry = store.get(key);
        return {
          status,
          record: entry ? { key, value: entry.value, updatedAt: entry.updatedAt } : null,
        };
      }),
      saveLocalStorageRecordIfUnchanged: vi.fn(
        async ({
          key,
          value,
          expectedUpdatedAt,
        }: {
          key: string;
          value: string;
          expectedUpdatedAt: string | null;
        }) => {
          const entry = store.get(key);
          const currentUpdatedAt = entry?.updatedAt ?? null;
          if (currentUpdatedAt !== expectedUpdatedAt) {
            return { ok: false, status, currentUpdatedAt, message: 'Conflicto de concurrencia.' };
          }
          const updatedAt = new Date().toISOString();
          store.set(key, { value, updatedAt });
          return { ok: true, status, currentUpdatedAt: updatedAt, message: 'Guardado.' };
        },
      ),
    },
  });
}

async function createActaSafely(overrides: Partial<ActaDraft> = {}): Promise<string> {
  const result = await useActasStore.getState().createWithConcurrencyCheck(draft(overrides));
  expect(result.ok).toBe(true);
  expect(result.recordId).toBeTruthy();
  return result.recordId as string;
}

function draftFromActa(acta: Acta, overrides: Partial<ActaDraft> = {}): ActaDraft {
  return {
    titulo: acta.titulo,
    tipo: acta.tipo,
    fechaSesion: acta.fechaSesion,
    estado: acta.estado,
    fechaLimite: acta.fechaLimite,
    observaciones: acta.observaciones,
    alegaciones: acta.alegaciones,
    actualizaciones: acta.actualizaciones,
    actaPath: acta.actaPath,
    ...overrides,
  };
}

async function transitionActa(id: string, estado: ActaState, overrides: Partial<ActaDraft> = {}): Promise<void> {
  const current = useActasStore.getState().actas.find((acta) => acta.id === id);
  expect(current).toBeDefined();
  if (!current) return;
  const result = await useActasStore.getState().updateWithConcurrencyCheck(
    id,
    draftFromActa(current, { estado, ...overrides }),
    current.updatedAt,
  );
  expect(result.ok).toBe(true);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useActasStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useActasStore.setState({ actas: [], actaTypes: [] });
    installFakePersistedRecordsBackend();
  });

  it('crea, persiste y recarga un acta normalizando el borrador', async () => {
    const id = await createActaSafely({ titulo: '  Acta con espacios  ', observaciones: '  Texto  ' });

    expect(useActasStore.getState().actas[0]).toMatchObject({
      id,
      titulo: 'Acta con espacios',
      observaciones: 'Texto',
      estado: 'Pendiente de realizar',
      closedAt: null,
    });

    useActasStore.setState({ actas: [], actaTypes: [] });
    installFakePersistedRecordsBackend();
    useActasStore.getState().load();

    expect(useActasStore.getState().actas[0].id).toBe(id);
    expect(JSON.parse(window.localStorage.getItem(ACTAS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('actualiza por el ciclo válido, conserva datos y cierra sin perder la fecha de creación', async () => {
    const id = await createActaSafely();
    const originalCreatedAt = useActasStore.getState().actas[0].createdAt;

    await transitionActa(id, 'Borrador');
    await transitionActa(id, 'Enviada a Dirección');
    await transitionActa(id, 'Pendiente de alegaciones');
    await transitionActa(id, 'Pendiente de firma', {
      actaPath: '  C:/actas/ce.docx  ',
      alegaciones: [{ sindicato: 'ELA', presentada: true, fecha: '2026-06-20', observacion: 'Alegación' }],
    });

    let acta = useActasStore.getState().actas.find((item) => item.id === id);
    expect(acta).toMatchObject({ estado: 'Pendiente de firma', actaPath: 'C:/actas/ce.docx', closedAt: null });
    expect(acta?.createdAt).toBe(originalCreatedAt);
    expect(acta?.alegaciones).toHaveLength(1);

    await transitionActa(id, 'Cerrada');
    acta = useActasStore.getState().actas.find((item) => item.id === id);
    expect(acta?.estado).toBe('Cerrada');
    expect(acta?.closedAt).toBe(timestamp);
  });

  it('persiste actualizaciones editadas mediante la API concurrente', async () => {
    const id = await createActaSafely();
    const current = useActasStore.getState().actas.find((acta) => acta.id === id);
    expect(current).toBeDefined();
    if (!current) return;

    const result = await useActasStore.getState().updateWithConcurrencyCheck(
      id,
      draftFromActa(current, {
        actualizaciones: [
          { id: 'update-2', fecha: timestamp, texto: 'Segunda actualización' },
          { id: 'update-1', fecha: timestamp, texto: 'Primera actualización' },
        ],
      }),
      current.updatedAt,
    );

    expect(result.ok).toBe(true);
    expect(useActasStore.getState().actas[0].actualizaciones.map((entry) => entry.texto)).toEqual([
      'Segunda actualización',
      'Primera actualización',
    ]);
  });

  it('crea un acta desde sesión una sola vez y conserva el vínculo de origen', async () => {
    const input = { tipo: 'Comité', session: session(), treatedTasks: [task()] };

    const first = await useActasStore.getState().createFromSessionWithConcurrencyCheck(input);
    const second = await useActasStore.getState().createFromSessionWithConcurrencyCheck(input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const firstId = first.recordId;
    expect(firstId).toBeTruthy();
    expect(second.recordId).toBe(firstId);
    expect(useActasStore.getState().actas).toHaveLength(1);
    expect(useActasStore.getState().actas[0]).toMatchObject({
      id: firstId,
      sourceSessionId: 'session-1',
      fechaSesion: '2026-06-17',
      titulo: 'Comité junio',
    });
    expect(useActasStore.getState().actas[0].observaciones).toContain('1. Punto tratado');
  });

  it('gestiona tipos de acta evitando duplicados y eliminaciones con actas asociadas', async () => {
    useActasStore.getState().load();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect((await useActasStore.getState().createActaType('  Comité  ')).ok).toBe(false);
    expect((await useActasStore.getState().createActaType('Mesa Técnica')).ok).toBe(true);
    expect(useActasStore.getState().actaTypes.map((type) => type.nombre)).toContain('Mesa Técnica');

    const type = useActasStore.getState().actaTypes.find((item) => item.nombre === 'Mesa Técnica');
    expect(type).toBeDefined();
    if (!type) return;

    await useActasStore.getState().toggleActaType(type.id);
    expect(useActasStore.getState().actaTypes.find((item) => item.id === type.id)?.disabled).toBe(true);
    expect((await useActasStore.getState().removeActaType(type.id)).ok).toBe(true);
    expect(window.localStorage.getItem(ACTA_TYPES_STORAGE_KEY)).toContain('Comité');

    await createActaSafely({ tipo: 'Comité' });
    const comiteType = useActasStore.getState().actaTypes.find((item) => item.nombre === 'Comité');
    expect(comiteType).toBeDefined();
    if (!comiteType) return;
    expect(await useActasStore.getState().removeActaType(comiteType.id)).toMatchObject({ ok: false });
  });
});
