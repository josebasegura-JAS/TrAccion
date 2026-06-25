import { describe, expect, it } from 'vitest';

import type { Employee } from '../../plantilla/domain/employee';
import type { GrupoCobertura } from './gruposCobertura';
import type { TeletrabajoPuesto } from './puestosTeletrabajo';
import {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
  evaluateTeletrabajoPresencialidad,
  getTeletrabajoSemaforo,
} from './semaforo';
import type { TeletrabajoSolicitud } from './solicitud';

function buildSolicitud(overrides: Partial<TeletrabajoSolicitud>): TeletrabajoSolicitud {
  return {
    id: 'teletrabajo-base',
    empleado: '100',
    nombreApellidos: 'Persona Base',
    puestoNomina: 'Técnico/a',
    puestoOrganizativo: 'Administrativo/a',
    residencia: 'Oficinas Centrales',
    dni: '12345678Z',
    direccionTeletrabajo: 'Calle Base 1 Bilbao Bizkaia',
    estado: 'pendiente',
    tipoSolicitud: 'nueva',
    diasTeletrabajo: ['martes'],
    fechaSolicitud: '2026-06-01',
    fechaOrdenador: '2026-01-02',
    fechaCascos: '2026-01-03',
    periodo: '2026-2027',
    observaciones: '',
    validacionSeguridadInformatica: false,
    validacionPrevencion: false,
    validacionJefatura: false,
    revisado: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    empleado: '100',
    nombreApellidos: 'Persona Base',
    puestoNomina: 'Técnico/a',
    puestoOrganizativo: 'Administrativo/a',
    puestoEus: '',
    residencia: 'Oficinas Centrales',
    unidad: '',
    nivelRetributivo: '',
    direccionOrganizativa: '',
    antiguedadPuesto: '2020-01-01',
    sexo: '',
    calle: '',
    numero: '',
    piso: '',
    codigoPostal: '',
    poblacion: '',
    provincia: '',
    nif: '',
    dni: '12345678Z',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt: null,
    ...overrides,
  };
}

function buildPuesto(overrides: Partial<TeletrabajoPuesto>): TeletrabajoPuesto {
  return {
    id: 'puesto-base',
    puesto: 'Administrativo/a',
    maxSolicitudes: 2,
    dotacionComputable: 0,
    grupoCoberturaId: null,
    observaciones: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

describe('presencialidad mínima del puesto acotada al periodo de cada solicitud', () => {
  it('no marca a revisar cuando las solicitudes que superan el mínimo son de otro periodo', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    const solicitudPeriodoAnterior1 = buildSolicitud({
      id: 'sol-1',
      empleado: '100',
      periodo: '2025-2026',
    });
    const solicitudPeriodoAnterior2 = buildSolicitud({
      id: 'sol-2',
      empleado: '101',
      periodo: '2025-2026',
    });
    const solicitudPeriodoActual = buildSolicitud({
      id: 'sol-3',
      empleado: '102',
      periodo: '2026-2027',
    });

    const solicitudes = [
      solicitudPeriodoAnterior1,
      solicitudPeriodoAnterior2,
      solicitudPeriodoActual,
    ];
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const semaforo = getTeletrabajoSemaforo(
      solicitudPeriodoActual,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
  });

  it('no marca a revisar si el mismo puesto mantiene presencialidad mínima repartiendo días', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
    ]);

    const solicitudMartesJueves = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      periodo: '2026-2027',
      diasTeletrabajo: ['miercoles'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount([
      solicitudMartesJueves,
      solicitudMiercoles,
    ]);

    const semaforo = getTeletrabajoSemaforo(
      solicitudMiercoles,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
  });



  it('queda ok con tres personas, presencialidad mínima dos y días repartidos', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    const solicitudMartes = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      periodo: '2026-2027',
      diasTeletrabajo: ['miercoles'],
    });
    const solicitudJueves = buildSolicitud({
      id: 'sol-c',
      empleado: '102',
      periodo: '2026-2027',
      diasTeletrabajo: ['jueves'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount([
      solicitudMartes,
      solicitudMiercoles,
      solicitudJueves,
    ]);

    const semaforo = getTeletrabajoSemaforo(
      solicitudJueves,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
  });

  it('marca a revisar cuando se supera el mínimo dentro del mismo periodo', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
    ]);

    const solicitudA = buildSolicitud({ id: 'sol-a', empleado: '100', periodo: '2026-2027' });
    const solicitudB = buildSolicitud({ id: 'sol-b', empleado: '101', periodo: '2026-2027' });

    const solicitudes = [solicitudA, solicitudB];
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const semaforo = getTeletrabajoSemaforo(
      solicitudB,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('review');
    expect(semaforo.title).toContain('presencialidad mínima');
  });

  it('no mezcla el conteo entre puestos distintos del mismo periodo', () => {
    const puestoA = buildPuesto({ id: 'puesto-a', puesto: 'Administrativo/a', maxSolicitudes: 1 });
    const puestoB = buildPuesto({ id: 'puesto-b', puesto: 'Técnico/a', maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puestoA, puestoB]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
    ]);

    const solicitudAdministrativo = buildSolicitud({
      id: 'sol-admin',
      empleado: '100',
      puestoOrganizativo: 'Administrativo/a',
      periodo: '2026-2027',
    });
    const solicitudTecnico = buildSolicitud({
      id: 'sol-tecnico',
      empleado: '101',
      puestoOrganizativo: 'Técnico/a',
      periodo: '2026-2027',
    });

    const solicitudes = [solicitudAdministrativo, solicitudTecnico];
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const semaforo = getTeletrabajoSemaforo(
      solicitudAdministrativo,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
  });

  it('ignora las solicitudes denegadas o eliminadas al contar el periodo', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    const solicitudDenegada = buildSolicitud({
      id: 'sol-denegada',
      empleado: '100',
      periodo: '2026-2027',
      estado: 'denegada',
    });
    const solicitudEliminada = buildSolicitud({
      id: 'sol-eliminada',
      empleado: '101',
      periodo: '2026-2027',
      deletedAt: '2026-06-01T00:00:00.000Z',
    });
    const solicitudActiva = buildSolicitud({
      id: 'sol-activa',
      empleado: '102',
      periodo: '2026-2027',
    });

    const solicitudes = [solicitudDenegada, solicitudEliminada, solicitudActiva];
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const semaforo = getTeletrabajoSemaforo(
      solicitudActiva,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
  });

  it('no revienta cuando una solicitud llega con periodo undefined o null (registro legacy/corrupto)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);

    const solicitudSinPeriodo = buildSolicitud({
      id: 'sol-sin-periodo',
      empleado: '100',
      // Simula un registro legacy/corrupto donde 'periodo' no llega como string.
      periodo: undefined as unknown as string,
    });

    const solicitudes = [solicitudSinPeriodo];

    expect(() => buildSolicitudesByPeriodoPuestoCount(solicitudes)).not.toThrow();

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    expect(() =>
      getTeletrabajoSemaforo(
        solicitudSinPeriodo,
        puestosByKey,
        solicitudesByPuestoCount,
        employeesByEmpleado,
      ),
    ).not.toThrow();
  });

  it('no contagia el conflicto de un día a una solicitud que pide un día distinto sin problema (3 personas, mínimo 2)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    // Dos personas piden martes y jueves a la vez (conflicto real: solo
    // quedaría 1 presencial esos días frente al mínimo de 2). La tercera
    // pide únicamente miércoles, día sin conflicto.
    const solicitudMartesJueves1 = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMartesJueves2 = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-c',
      empleado: '102',
      periodo: '2026-2027',
      diasTeletrabajo: ['miercoles'],
    });

    const solicitudes = [solicitudMartesJueves1, solicitudMartesJueves2, solicitudMiercoles];
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const semaforoMartesJueves1 = getTeletrabajoSemaforo(
      solicitudMartesJueves1,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );
    const semaforoMartesJueves2 = getTeletrabajoSemaforo(
      solicitudMartesJueves2,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );
    const semaforoMiercoles = getTeletrabajoSemaforo(
      solicitudMiercoles,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforoMartesJueves1.status).toBe('review');
    expect(semaforoMartesJueves2.status).toBe('review');
    // La solicitud de miércoles no debe heredar el conflicto de martes/jueves:
    // su propio día no tiene ningún problema de presencialidad mínima.
    expect(semaforoMiercoles.status).toBe('ok');
  });

  it('marca conflicto a las tres si las tres piden los mismos dos días (mínimo 2)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    const solicitudes = ['100', '101', '102'].map((empleado, index) =>
      buildSolicitud({
        id: `sol-${index}`,
        empleado,
        periodo: '2026-2027',
        diasTeletrabajo: ['martes', 'jueves'],
      }),
    );
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    solicitudes.forEach((solicitud) => {
      const semaforo = getTeletrabajoSemaforo(
        solicitud,
        puestosByKey,
        solicitudesByPuestoCount,
        employeesByEmpleado,
      );
      expect(semaforo.status).toBe('review');
    });
  });
});

describe('grupos de cobertura: puestos coordinados que comparten presencialidad mínima', () => {
  function buildGrupo(overrides: Partial<GrupoCobertura>): GrupoCobertura {
    return {
      id: 'grupo-base',
      nombre: 'Grupo base',
      presencialidadMinima: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      ...overrides,
    };
  }

  it('dos puestos del mismo grupo comparten presencialidad mínima y dotación conjunta', () => {
    const grupo = buildGrupo({ id: 'grupo-recepcion', presencialidadMinima: 2 });
    const gruposById = new Map([[grupo.id, grupo]]);

    const puestoA = buildPuesto({
      id: 'puesto-a',
      puesto: 'Recepcionista turno mañana',
      maxSolicitudes: 0,
      dotacionComputable: 1,
      grupoCoberturaId: grupo.id,
    });
    const puestoB = buildPuesto({
      id: 'puesto-b',
      puesto: 'Recepcionista turno tarde',
      maxSolicitudes: 0,
      dotacionComputable: 1,
      grupoCoberturaId: grupo.id,
    });
    const puestosByKey = buildPuestosByKey([puestoA, puestoB]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
    ]);

    // Cada puesto tiene 1 persona de dotación (2 en total entre los dos), y el
    // grupo exige mínimo 2 presenciales: si las dos personas piden teletrabajo
    // el mismo día, debe marcar incidencia aunque pertenezcan a puestos distintos.
    const solicitudA = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      puestoOrganizativo: 'Recepcionista turno mañana',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes'],
    });
    const solicitudB = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      puestoOrganizativo: 'Recepcionista turno tarde',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(
      [solicitudA, solicitudB],
      puestosByKey,
    );

    const semaforoA = getTeletrabajoSemaforo(
      solicitudA,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
      gruposById,
    );

    expect(semaforoA.status).toBe('review');
    expect(semaforoA.title).toContain('presencialidad mínima');
  });

  it('no marca incidencia si solo una persona del grupo pide el mismo día (cumple el mínimo conjunto)', () => {
    const grupo = buildGrupo({ id: 'grupo-recepcion', presencialidadMinima: 2 });
    const gruposById = new Map([[grupo.id, grupo]]);

    const puestoA = buildPuesto({
      id: 'puesto-a',
      puesto: 'Recepcionista turno mañana',
      maxSolicitudes: 0,
      dotacionComputable: 2,
      grupoCoberturaId: grupo.id,
    });
    const puestoB = buildPuesto({
      id: 'puesto-b',
      puesto: 'Recepcionista turno tarde',
      maxSolicitudes: 0,
      dotacionComputable: 1,
      grupoCoberturaId: grupo.id,
    });
    const puestosByKey = buildPuestosByKey([puestoA, puestoB]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100' })],
      ['101', buildEmployee({ empleado: '101' })],
      ['102', buildEmployee({ empleado: '102' })],
    ]);

    // Dotación conjunta del grupo: 3 personas. Mínimo exigido: 2. Si solo 1
    // pide teletrabajo ese día, quedan 2 presenciales: cumple justo el mínimo.
    const solicitudSolicitante = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      puestoOrganizativo: 'Recepcionista turno mañana',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(
      [solicitudSolicitante],
      puestosByKey,
    );

    const semaforo = getTeletrabajoSemaforo(
      solicitudSolicitante,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
      gruposById,
    );

    expect(semaforo.status).toBe('ok');
    expect(semaforo.title).toContain('mín. 2 presenciales');
  });

  it('un puesto sin grupo de cobertura usa su propia presencialidad mínima individual, sin afectar a otros puestos', () => {
    const grupo = buildGrupo({ id: 'grupo-recepcion', presencialidadMinima: 5 });
    const gruposById = new Map([[grupo.id, grupo]]);

    const puestoAgrupado = buildPuesto({
      id: 'puesto-a',
      puesto: 'Recepcionista',
      maxSolicitudes: 0,
      dotacionComputable: 1,
      grupoCoberturaId: grupo.id,
    });
    const puestoIndividual = buildPuesto({
      id: 'puesto-b',
      puesto: 'Administrativo/a',
      maxSolicitudes: 1,
      dotacionComputable: 1,
      grupoCoberturaId: null,
    });
    const puestosByKey = buildPuestosByKey([puestoAgrupado, puestoIndividual]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);

    const solicitud = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      puestoOrganizativo: 'Administrativo/a',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount([solicitud], puestosByKey);

    const semaforo = getTeletrabajoSemaforo(
      solicitud,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
      gruposById,
    );

    // El puesto individual exige mínimo 1, no el mínimo 5 del grupo al que no pertenece.
    expect(semaforo.title).toContain('mín. 1 presenciales');
  });

  it('sin grupos de cobertura informados (parámetro por defecto), el cálculo sigue funcionando con la presencialidad mínima del propio puesto', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1, dotacionComputable: 3, grupoCoberturaId: null });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);

    const solicitud = buildSolicitud({ id: 'sol-a', empleado: '100', periodo: '2026-2027' });
    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount([solicitud], puestosByKey);

    // No se pasa el quinto argumento (gruposById): debe usar el valor por defecto sin lanzar error.
    const semaforo = getTeletrabajoSemaforo(
      solicitud,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
    );

    expect(semaforo.status).toBe('ok');
    expect(semaforo.title).toContain('1 petición');
  });

  it('no marca a revisar un grupo de cobertura con dos puestos si cada día mantiene una persona presencial aunque la dotación no esté parametrizada', () => {
    const grupo = buildGrupo({ id: 'grupo-cobertura', presencialidadMinima: 1 });
    const gruposById = new Map([[grupo.id, grupo]]);

    const puestoA = buildPuesto({
      id: 'puesto-a',
      puesto: 'Puesto A',
      maxSolicitudes: 0,
      dotacionComputable: 0,
      grupoCoberturaId: grupo.id,
    });
    const puestoB = buildPuesto({
      id: 'puesto-b',
      puesto: 'Puesto B',
      maxSolicitudes: 0,
      dotacionComputable: 0,
      grupoCoberturaId: grupo.id,
    });
    const puestosByKey = buildPuestosByKey([puestoA, puestoB]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100', puestoOrganizativo: 'Puesto A' })],
      ['101', buildEmployee({ empleado: '101', puestoOrganizativo: 'Puesto B' })],
    ]);

    const solicitudMartesJueves = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      puestoOrganizativo: 'Puesto A',
      periodo: '2026-2027',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      puestoOrganizativo: 'Puesto B',
      periodo: '2026-2027',
      diasTeletrabajo: ['miercoles'],
    });

    const solicitudesByPuestoCount = buildSolicitudesByPeriodoPuestoCount(
      [solicitudMartesJueves, solicitudMiercoles],
      puestosByKey,
    );

    const semaforoMartesJueves = getTeletrabajoSemaforo(
      solicitudMartesJueves,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
      gruposById,
    );
    const semaforoMiercoles = getTeletrabajoSemaforo(
      solicitudMiercoles,
      puestosByKey,
      solicitudesByPuestoCount,
      employeesByEmpleado,
      gruposById,
    );

    expect(semaforoMartesJueves.status).toBe('ok');
    expect(semaforoMiercoles.status).toBe('ok');
  });

});

describe('evaluateTeletrabajoPresencialidad — indicador aislado, sin antigüedad ni estado', () => {
  it('cumple presencialidad aunque la antigüedad sea insuficiente (motivos independientes)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 0, dotacionComputable: 0 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([
      ['100', buildEmployee({ empleado: '100', antiguedadPuesto: '2026-05-01' })],
    ]);
    // Antigüedad insuficiente para esta fecha de solicitud (cumple el año el
    // 2027-05-01), pero eso no debe afectar al cálculo de presencialidad.
    const solicitud = buildSolicitud({ fechaSolicitud: '2026-06-01', diasTeletrabajo: ['martes'] });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
    );

    expect(presencialidad.status).toBe('cumple');
  });

  it('cumple presencialidad aunque la solicitud esté rechazada (motivos independientes)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);
    const solicitud = buildSolicitud({ estado: 'denegada', diasTeletrabajo: ['martes'] });
    // buildSolicitudesByPeriodoPuestoCount ya excluye las denegadas del
    // conteo de conflictos, así que esta sola solicitud no genera ninguno.
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
    );

    expect(presencialidad.status).toBe('cumple');
  });

  it('marca a revisar (no a no-cumple) una solicitud sin ningún día de la semana marcado', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);
    const solicitud = buildSolicitud({ estado: 'denegada', diasTeletrabajo: [] });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
    );

    expect(presencialidad.status).toBe('revisar');
    expect(presencialidad.title).toContain('Sin días de la semana marcados');
  });

  it('no cumple si el puesto organizativo no está configurado como teletrabajable', () => {
    const puestosByKey = buildPuestosByKey([]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);
    const solicitud = buildSolicitud({ puestoOrganizativo: 'Puesto Inexistente', diasTeletrabajo: ['martes'] });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitud,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
    );

    expect(presencialidad.status).toBe('no-cumple');
  });

  it('marca a revisar (no no-cumple) cuando hay conflicto real de presencialidad mínima', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2, dotacionComputable: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesByEmpleado = new Map([['100', buildEmployee({ empleado: '100' })]]);
    const solicitudA = buildSolicitud({ empleado: '100', diasTeletrabajo: ['martes'] });
    const solicitudB = buildSolicitud({ empleado: '101', diasTeletrabajo: ['martes'] });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitudA, solicitudB]);

    const presencialidad = evaluateTeletrabajoPresencialidad(
      solicitudA,
      puestosByKey,
      solicitudesByPuestoDiaCount,
      employeesByEmpleado,
    );

    expect(presencialidad.status).toBe('revisar');
  });
});
