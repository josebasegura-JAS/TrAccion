import { describe, expect, it } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';
import {
  ACTA_STATES,
  buildActaObservacionesFromSession,
  createDefaultActaTypes,
  isActaState,
  isActaType,
  normalizeActaTypeName,
} from './acta';

const timestamp = '2026-06-17T08:00:00.000Z';

function session(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    id: 'session-1',
    date: '2026-06-17',
    code: 'CE-2026-06',
    title: 'Comité de Empresa',
    notes: 'Notas previas de la sesión',
    status: 'open',
    items: ['task-1', 'task-2'],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    closedAt: null,
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
    estado: 'pendiente',
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
    closedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('acta domain', () => {
  it('normaliza tipos de acta y rechaza nombres vacíos', () => {
    expect(normalizeActaTypeName('  Comité   extraordinario  ')).toBe('Comité extraordinario');
    expect(isActaType(' Paritaria ')).toBe(true);
    expect(isActaType('   ')).toBe(false);
  });

  it('mantiene el catálogo de estados esperado', () => {
    expect(ACTA_STATES).toEqual([
      'Pendiente de redactar',
      'Enviada a Dirección',
      'Pendiente de alegaciones',
      'Pendiente de firma',
      'Cerrada',
    ]);
    expect(isActaState('Pendiente de alegaciones')).toBe(true);
    expect(isActaState('Estado inventado')).toBe(false);
  });

  it('crea tipos por defecto estables para Comité y Paritaria', () => {
    const types = createDefaultActaTypes();

    expect(types.map((type) => type.nombre)).toEqual(['Comité', 'Paritaria']);
    expect(types.every((type) => type.disabled === false)).toBe(true);
    expect(types.map((type) => type.id)).toEqual(['acta-type-comite', 'acta-type-paritaria']);
  });

  it('construye observaciones desde sesión sin perder notas ni puntos tratados', () => {
    const observaciones = buildActaObservacionesFromSession(session(), [
      task({ titulo: 'Calendario laboral' }),
      task({ id: 'task-2', titulo: 'Permisos y licencias' }),
    ]);

    expect(observaciones).toContain('Notas previas de la sesión');
    expect(observaciones).toContain('Tareas tratadas:');
    expect(observaciones).toContain('1. Calendario laboral');
    expect(observaciones).toContain('2. Permisos y licencias');
  });

  it('deja constancia explícita si una sesión no tiene tareas tratadas', () => {
    expect(buildActaObservacionesFromSession(session({ notes: '' }), [])).toBe('Sin tareas tratadas.');
  });
});
