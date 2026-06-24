import { describe, expect, it } from 'vitest';

import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoPuesto } from './puestosTeletrabajo';
import { buildPuestosByKey, buildSolicitudesByPeriodoPuestoCount } from './semaforo';
import type { TeletrabajoSolicitud } from './solicitud';
import { buildTeletrabajoAssessment } from './exportDireccion';

const timestamp = '2026-01-01T00:00:00.000Z';

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
    createdAt: timestamp,
    updatedAt: timestamp,
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
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function buildEmployeesById(employees: readonly Employee[]): Map<string, Employee> {
  return new Map(employees.map((employee) => [employee.empleado.trim(), employee]));
}

describe('buildTeletrabajoAssessment — presencialidad mínima en la exportación a Dirección', () => {
  it('no contagia el conflicto de un día a una solicitud que pide un día distinto sin problema (3 personas, mínimo 2)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([
      buildEmployee({ empleado: '100' }),
      buildEmployee({ empleado: '101' }),
      buildEmployee({ empleado: '102' }),
    ]);

    // Dos personas piden martes y jueves a la vez (conflicto real: solo
    // quedaría 1 presencial esos días frente al mínimo de 2). La tercera
    // pide únicamente miércoles, día sin conflicto.
    const solicitudMartesJueves1 = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMartesJueves2 = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-c',
      empleado: '102',
      diasTeletrabajo: ['miercoles'],
    });

    const solicitudes = [solicitudMartesJueves1, solicitudMartesJueves2, solicitudMiercoles];
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    const assessmentMartesJueves1 = buildTeletrabajoAssessment({
      solicitud: solicitudMartesJueves1,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });
    const assessmentMartesJueves2 = buildTeletrabajoAssessment({
      solicitud: solicitudMartesJueves2,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });
    const assessmentMiercoles = buildTeletrabajoAssessment({
      solicitud: solicitudMiercoles,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessmentMartesJueves1.status).toBe('review');
    expect(assessmentMartesJueves2.status).toBe('review');
    // La solicitud de miércoles no debe heredar el conflicto de martes/jueves:
    // su propio día no tiene ningún problema de presencialidad mínima.
    expect(assessmentMiercoles.status).toBe('ok');
    expect(assessmentMiercoles.cellValue).toBe('SI');
    expect(assessmentMiercoles.rowFillColor).toBeNull();
  });

  it('marca conflicto a las tres si las tres piden los mismos dos días (mínimo 2)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([
      buildEmployee({ empleado: '100' }),
      buildEmployee({ empleado: '101' }),
      buildEmployee({ empleado: '102' }),
    ]);

    const solicitudes = ['100', '101', '102'].map((empleado, index) =>
      buildSolicitud({
        id: `sol-${index}`,
        empleado,
        diasTeletrabajo: ['martes', 'jueves'],
      }),
    );
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount(solicitudes);

    solicitudes.forEach((solicitud) => {
      const assessment = buildTeletrabajoAssessment({
        solicitud,
        employeesById,
        puestosByKey,
        solicitudesByPuestoDiaCount,
      });
      expect(assessment.status).toBe('review');
      expect(assessment.cellValue).toBe('REVISAR');
    });
  });

  it('no marca a revisar si el mismo puesto mantiene presencialidad mínima repartiendo días', () => {
    const puesto = buildPuesto({ maxSolicitudes: 1 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([
      buildEmployee({ empleado: '100' }),
      buildEmployee({ empleado: '101' }),
    ]);

    const solicitudMartesJueves = buildSolicitud({
      id: 'sol-a',
      empleado: '100',
      diasTeletrabajo: ['martes', 'jueves'],
    });
    const solicitudMiercoles = buildSolicitud({
      id: 'sol-b',
      empleado: '101',
      diasTeletrabajo: ['miercoles'],
    });

    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([
      solicitudMartesJueves,
      solicitudMiercoles,
    ]);

    const assessment = buildTeletrabajoAssessment({
      solicitud: solicitudMiercoles,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessment.status).toBe('ok');
  });

  it('marca como rechazada (rojo) una solicitud denegada sin evaluar presencialidad', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([buildEmployee({ empleado: '100' })]);
    const solicitud = buildSolicitud({ estado: 'denegada' });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const assessment = buildTeletrabajoAssessment({
      solicitud,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessment.status).toBe('rejected');
    expect(assessment.cellValue).toBe('NO');
    expect(assessment.apuntesRrll).toBe('Rechazada por RRLL');
  });

  it('marca como bloqueada (rojo) si no cumple antigüedad mínima', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([
      buildEmployee({ empleado: '100', antiguedadPuesto: '2026-05-01' }),
    ]);
    const solicitud = buildSolicitud({ fechaSolicitud: '2026-06-01' });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const assessment = buildTeletrabajoAssessment({
      solicitud,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessment.status).toBe('blocked');
    expect(assessment.apuntesRrll).toBe('Antigüedad insuficiente');
  });

  it('marca a revisar si el empleado no aparece en Plantilla (antigüedad sin dato)', () => {
    const puesto = buildPuesto({ maxSolicitudes: 2 });
    const puestosByKey = buildPuestosByKey([puesto]);
    const employeesById = buildEmployeesById([]);
    const solicitud = buildSolicitud({});
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const assessment = buildTeletrabajoAssessment({
      solicitud,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessment.status).toBe('review');
    expect(assessment.cellValue).toBe('REVISAR');
  });

  it('marca bloqueada si el puesto organizativo no está configurado como teletrabajable', () => {
    const puestosByKey = buildPuestosByKey([]);
    const employeesById = buildEmployeesById([buildEmployee({ empleado: '100' })]);
    const solicitud = buildSolicitud({ puestoOrganizativo: 'Puesto Inexistente' });
    const solicitudesByPuestoDiaCount = buildSolicitudesByPeriodoPuestoCount([solicitud]);

    const assessment = buildTeletrabajoAssessment({
      solicitud,
      employeesById,
      puestosByKey,
      solicitudesByPuestoDiaCount,
    });

    expect(assessment.status).toBe('blocked');
    expect(assessment.apuntesRrll).toBe('Puesto organizativo');
  });
});
