import { describe, expect, it } from 'vitest';

import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoPuesto } from './puestosTeletrabajo';
import {
  buildPuestosByKey,
  buildSolicitudesByPeriodoPuestoCount,
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
});
