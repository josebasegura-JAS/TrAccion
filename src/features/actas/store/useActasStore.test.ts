import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';
import { EMPTY_ACTA_DRAFT, type ActaDraft } from '../domain/acta';
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

afterEach(() => {
  vi.useRealTimers();
});

describe('useActasStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    useActasStore.setState({ actas: [], actaTypes: [] });
  });

  it('crea, persiste y recarga un acta normalizando el borrador', () => {
    const id = useActasStore.getState().create(draft({ titulo: '  Acta con espacios  ', observaciones: '  Texto  ' }));

    expect(useActasStore.getState().actas[0]).toMatchObject({
      id,
      titulo: 'Acta con espacios',
      observaciones: 'Texto',
      estado: 'Pendiente de redactar',
      closedAt: null,
    });

    useActasStore.setState({ actas: [], actaTypes: [] });
    useActasStore.getState().load();

    expect(useActasStore.getState().actas[0].id).toBe(id);
    expect(JSON.parse(window.localStorage.getItem(ACTAS_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });

  it('actualiza estado, alegaciones, ruta y cierre sin perder fechas de creación', () => {
    const id = useActasStore.getState().create(draft());
    const originalCreatedAt = useActasStore.getState().actas[0].createdAt;

    useActasStore.getState().update(
      id,
      draft({
        estado: 'Pendiente de firma',
        actaPath: '  C:/actas/ce.docx  ',
        alegaciones: [{ sindicato: 'ELA', presentada: true, fecha: '2026-06-20', observacion: 'Alegación' }],
      }),
    );

    let acta = useActasStore.getState().actas[0];
    expect(acta).toMatchObject({ estado: 'Pendiente de firma', actaPath: 'C:/actas/ce.docx', closedAt: null });
    expect(acta.createdAt).toBe(originalCreatedAt);
    expect(acta.alegaciones).toHaveLength(1);

    useActasStore.getState().closeActa(id);
    acta = useActasStore.getState().actas[0];
    expect(acta.estado).toBe('Cerrada');
    expect(acta.closedAt).toBe(timestamp);
  });

  it('añade actualizaciones no vacías al inicio y no persiste textos en blanco', () => {
    const id = useActasStore.getState().create(draft());

    useActasStore.getState().addUpdate(id, '   ');
    useActasStore.getState().addUpdate(id, 'Primera actualización');
    useActasStore.getState().addUpdate(id, 'Segunda actualización');

    expect(useActasStore.getState().actas[0].actualizaciones.map((entry) => entry.texto)).toEqual([
      'Segunda actualización',
      'Primera actualización',
    ]);
  });

  it('crea un acta desde sesión una sola vez y conserva el vínculo de origen', () => {
    const input = { tipo: 'Comité', session: session(), treatedTasks: [task()] };

    const firstId = useActasStore.getState().createFromSession(input);
    const secondId = useActasStore.getState().createFromSession(input);

    expect(secondId).toBe(firstId);
    expect(useActasStore.getState().actas).toHaveLength(1);
    expect(useActasStore.getState().actas[0]).toMatchObject({
      id: firstId,
      sourceSessionId: 'session-1',
      fechaSesion: '2026-06-17',
      titulo: 'Comité junio',
    });
    expect(useActasStore.getState().actas[0].observaciones).toContain('1. Punto tratado');
  });

  it('gestiona tipos de acta evitando duplicados y eliminaciones con actas asociadas', () => {
    useActasStore.getState().load();

    expect(useActasStore.getState().createActaType('  Comité  ').ok).toBe(false);
    expect(useActasStore.getState().createActaType('Mesa Técnica').ok).toBe(true);
    expect(useActasStore.getState().actaTypes.map((type) => type.nombre)).toContain('Mesa Técnica');

    const type = useActasStore.getState().actaTypes.find((item) => item.nombre === 'Mesa Técnica');
    expect(type).toBeDefined();
    if (!type) return;

    useActasStore.getState().toggleActaType(type.id);
    expect(useActasStore.getState().actaTypes.find((item) => item.id === type.id)?.disabled).toBe(true);
    expect(useActasStore.getState().removeActaType(type.id).ok).toBe(true);
    expect(window.localStorage.getItem(ACTA_TYPES_STORAGE_KEY)).toContain('Comité');

    useActasStore.getState().create(draft({ tipo: 'Comité' }));
    const comiteType = useActasStore.getState().actaTypes.find((item) => item.nombre === 'Comité');
    expect(comiteType).toBeDefined();
    if (!comiteType) return;
    expect(useActasStore.getState().removeActaType(comiteType.id)).toMatchObject({ ok: false });
  });
});
