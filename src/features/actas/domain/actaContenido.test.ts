import { describe, expect, it } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import type { ManagedSession } from '../../../shared/sessions/session';
import type { CensoMiembro } from './censo';
import {
  buildActaPuntosFromSession,
  buildAsistenciaFromCenso,
  buildEmptyActaContenido,
  hasPendingVotacionPosiciones,
  isActaAcuerdoEstado,
  isActaPuntoResultado,
  isAsistenciaEstado,
  isVotacionPosicion,
  selectIncompleteAcuerdos,
  selectUnresolvedPuntos,
  selectVotacionesConPendientes,
  summarizeVotacionPosiciones,
  type ActaAcuerdo,
  type ActaPunto,
  type ActaVotacion,
} from './actaContenido';

const timestamp = '2026-05-21T08:00:00.000Z';

function censoMiembro(overrides: Partial<CensoMiembro> = {}): CensoMiembro {
  return {
    id: 'censo-1',
    tipoActa: 'Comité',
    grupo: 'Representación Sindical',
    nombre: 'Ejemplo Apellido',
    organizacion: 'ELA',
    disabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function session(overrides: Partial<ManagedSession> = {}): ManagedSession {
  return {
    id: 'session-1',
    date: '2026-05-21',
    code: 'CE-2026-05',
    title: 'Comité de Empresa',
    notes: '',
    status: 'open',
    items: ['task-1', 'task-2', 'task-3'],
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
    titulo: 'Servicio de Korrika',
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

describe('actaContenido domain — asistencia', () => {
  it('siembra la asistencia desde el censo, todos presentes por defecto', () => {
    const censo = [
      censoMiembro({ id: 'rd-1', grupo: 'Dirección', nombre: 'Andoni Hueso', organizacion: '' }),
      censoMiembro({ id: 'sind-1', organizacion: 'CIM', nombre: 'Persona CIM' }),
    ];

    const asistencia = buildAsistenciaFromCenso(censo);

    expect(asistencia).toEqual([
      {
        censoMiembroId: 'rd-1',
        nombre: 'Andoni Hueso',
        organizacion: '',
        grupo: 'Dirección',
        estado: 'presente',
        suplenteDeId: null,
        horaEntrada: '',
        horaSalida: '',
      },
      {
        censoMiembroId: 'sind-1',
        nombre: 'Persona CIM',
        organizacion: 'CIM',
        grupo: 'Representación Sindical',
        estado: 'presente',
        suplenteDeId: null,
        horaEntrada: '',
        horaSalida: '',
      },
    ]);
  });

  it('reconoce los 3 estados de asistencia válidos', () => {
    expect(isAsistenciaEstado('presente')).toBe(true);
    expect(isAsistenciaEstado('ausente')).toBe(true);
    expect(isAsistenciaEstado('suplencia')).toBe(true);
    expect(isAsistenciaEstado('de vacaciones')).toBe(false);
  });
});

describe('actaContenido domain — puntos del día desde la sesión', () => {
  it('siembra los puntos en el orden de session.items, ignorando tareas que no se encuentren', () => {
    const treatedTasks = [
      task({ id: 'task-1', titulo: 'Servicio de Korrika' }),
      task({ id: 'task-3', titulo: 'Firma digital de contratos' }),
      // task-2 deliberadamente ausente de treatedTasks (p. ej. se borró o no se llegó a tratar)
    ];

    const puntos = buildActaPuntosFromSession(session(), treatedTasks);

    expect(puntos).toEqual([
      { taskId: 'task-1', titulo: 'Servicio de Korrika', contenido: '', resultado: 'sin_resolver' },
      { taskId: 'task-3', titulo: 'Firma digital de contratos', contenido: '', resultado: 'sin_resolver' },
    ]);
  });

  it('reconoce los 4 resultados posibles de un punto', () => {
    expect(isActaPuntoResultado('sin_resolver')).toBe(true);
    expect(isActaPuntoResultado('acuerdo')).toBe(true);
    expect(isActaPuntoResultado('sin_acuerdo')).toBe(true);
    expect(isActaPuntoResultado('pendiente_votacion')).toBe(true);
    expect(isActaPuntoResultado('aprobado por unanimidad')).toBe(false);
  });
});

describe('actaContenido domain — acuerdos', () => {
  it('reconoce los 3 estados de acuerdo válidos', () => {
    expect(isActaAcuerdoEstado('pendiente')).toBe(true);
    expect(isActaAcuerdoEstado('en_curso')).toBe(true);
    expect(isActaAcuerdoEstado('cumplido')).toBe(true);
    expect(isActaAcuerdoEstado('archivado')).toBe(false);
  });
});

describe('actaContenido domain — votaciones', () => {
  function votacion(overrides: Partial<ActaVotacion> = {}): ActaVotacion {
    return {
      id: 'votacion-1',
      puntoId: 'punto-1',
      tema: 'Renovación del documento de Teletrabajo',
      posiciones: [],
      ...overrides,
    };
  }

  it('reconoce las 5 posiciones de voto válidas', () => {
    expect(isVotacionPosicion('favor')).toBe(true);
    expect(isVotacionPosicion('contra')).toBe(true);
    expect(isVotacionPosicion('abstencion')).toBe(true);
    expect(isVotacionPosicion('pendiente')).toBe(true);
    expect(isVotacionPosicion('no_participa')).toBe(true);
    expect(isVotacionPosicion('a favor con matices')).toBe(false);
  });

  it('summarizeVotacionPosiciones cuenta cada categoría, con las que no aparecen a 0', () => {
    const summary = summarizeVotacionPosiciones(
      votacion({
        posiciones: [
          { organizacion: 'ELA', posicion: 'favor', fecha: null, observacion: '' },
          { organizacion: 'CCOO', posicion: 'favor', fecha: null, observacion: '' },
          { organizacion: 'SEMAF', posicion: 'abstencion', fecha: null, observacion: '' },
          { organizacion: 'CIM', posicion: 'abstencion', fecha: null, observacion: '' },
          { organizacion: 'EGIE', posicion: 'abstencion', fecha: null, observacion: '' },
          { organizacion: 'USO', posicion: 'abstencion', fecha: null, observacion: '' },
          {
            organizacion: 'LAB',
            posicion: 'abstencion',
            fecha: '2026-05-28',
            observacion: 'mediante email',
          },
        ],
      }),
    );

    expect(summary).toEqual({ favor: 2, contra: 0, abstencion: 5, pendiente: 0, no_participa: 0 });
  });

  it('no calcula ningún "resultado legal" — solo recuento, deliberadamente', () => {
    const summary = summarizeVotacionPosiciones(
      votacion({ posiciones: [{ organizacion: 'ELA', posicion: 'contra', fecha: null, observacion: '' }] }),
    );

    expect(summary).not.toHaveProperty('aprobado');
    expect(summary).not.toHaveProperty('resultado');
  });

  it('hasPendingVotacionPosiciones detecta posiciones aún sin definir', () => {
    expect(
      hasPendingVotacionPosiciones(
        votacion({ posiciones: [{ organizacion: 'LAB', posicion: 'pendiente', fecha: null, observacion: '' }] }),
      ),
    ).toBe(true);

    expect(
      hasPendingVotacionPosiciones(
        votacion({ posiciones: [{ organizacion: 'LAB', posicion: 'favor', fecha: null, observacion: '' }] }),
      ),
    ).toBe(false);
  });
});

describe('actaContenido domain — controles previos a exportar', () => {
  it('buildEmptyActaContenido crea un contenido vacío y consistente', () => {
    const contenido = buildEmptyActaContenido('acta-1', timestamp);

    expect(contenido).toEqual({
      actaId: 'acta-1',
      organo: '',
      lugar: '',
      horaInicio: '',
      horaFin: '',
      recesos: [],
      asistencia: [],
      puntos: [],
      acuerdos: [],
      votaciones: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  });

  it('selectUnresolvedPuntos detecta puntos sin resultado explícito', () => {
    const puntos: ActaPunto[] = [
      { id: 'p1', orden: 1, taskId: null, titulo: 'Punto A', contenido: 'texto', resultado: 'acuerdo' },
      { id: 'p2', orden: 2, taskId: null, titulo: 'Punto B', contenido: 'texto', resultado: 'sin_resolver' },
    ];

    expect(selectUnresolvedPuntos({ puntos }).map((p) => p.id)).toEqual(['p2']);
  });

  it('selectIncompleteAcuerdos detecta acuerdos sin responsable o sin fecha límite', () => {
    const acuerdos: ActaAcuerdo[] = [
      {
        id: 'a1',
        puntoId: 'p1',
        descripcion: 'Completo',
        responsable: 'RD',
        fechaLimite: '2026-06-30',
        estado: 'pendiente',
        tareaSeguimientoId: null,
      },
      {
        id: 'a2',
        puntoId: 'p1',
        descripcion: 'Sin responsable',
        responsable: '',
        fechaLimite: '2026-06-30',
        estado: 'pendiente',
        tareaSeguimientoId: null,
      },
      {
        id: 'a3',
        puntoId: 'p1',
        descripcion: 'Sin fecha',
        responsable: 'RD',
        fechaLimite: '',
        estado: 'pendiente',
        tareaSeguimientoId: null,
      },
    ];

    expect(selectIncompleteAcuerdos({ acuerdos }).map((a) => a.id)).toEqual(['a2', 'a3']);
  });

  it('selectVotacionesConPendientes detecta votaciones con alguna posición sin definir', () => {
    const votaciones: ActaVotacion[] = [
      {
        id: 'v1',
        puntoId: null,
        tema: 'Resuelta',
        posiciones: [{ organizacion: 'ELA', posicion: 'favor', fecha: null, observacion: '' }],
      },
      {
        id: 'v2',
        puntoId: null,
        tema: 'Con pendientes',
        posiciones: [{ organizacion: 'LAB', posicion: 'pendiente', fecha: null, observacion: '' }],
      },
    ];

    expect(selectVotacionesConPendientes({ votaciones }).map((v) => v.id)).toEqual(['v2']);
  });
});
