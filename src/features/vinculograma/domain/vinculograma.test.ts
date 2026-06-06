import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import {
  calculateExpiryDate,
  findEmployeeByNumber,
  getVinculogramaStatus,
  sortVinculogramasByEmployeeNumber,
  suggestEmployees,
  visibleVinculogramas,
  type Vinculograma,
} from './vinculograma';

function buildRecord(overrides: Partial<Vinculograma>): Vinculograma {
  return {
    id: 'record-1',
    employeeNumber: '1',
    nombreCompleto: 'Persona Uno',
    linkedPerson: 'Persona vinculada',
    requestDate: '2026-01-01',
    expiryDate: '2029-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

function buildEmployee(overrides: Partial<Employee>): Employee {
  return {
    empleado: '1',
    nombreApellidos: 'Persona Uno',
    puestoNomina: '',
    puestoOrganizativo: '',
    residencia: '',
    nivelRetributivo: '',
    sexo: '',
    calle: '',
    numero: '',
    piso: '',
    codigoPostal: '',
    poblacion: '',
    provincia: '',
    nif: '',
    dni: '',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt: null,
    ...overrides,
  };
}

describe('vinculograma domain', () => {
  it('calcula fecha vigencia como fecha solicitud más 3 años', () => {
    expect(calculateExpiryDate('2026-06-06')).toBe('2029-06-06');
  });

  it('marca vigente si expiryDate es hoy o futura', () => {
    expect(getVinculogramaStatus('2026-06-06', '2026-06-06')).toBe('Vigente');
    expect(getVinculogramaStatus('2026-06-07', '2026-06-06')).toBe('Vigente');
  });

  it('marca vencido si expiryDate es anterior a hoy', () => {
    expect(getVinculogramaStatus('2026-06-05', '2026-06-06')).toBe('Vencido');
  });

  it('ordena por nº empleado numérico ascendente', () => {
    const sorted = sortVinculogramasByEmployeeNumber([
      buildRecord({ id: '10', employeeNumber: '10' }),
      buildRecord({ id: '2', employeeNumber: '2' }),
      buildRecord({ id: '1', employeeNumber: '1' }),
    ]);

    expect(sorted.map((record) => record.employeeNumber)).toEqual(['1', '2', '10']);
  });

  it('excluye registros con deletedAt', () => {
    const visible = visibleVinculogramas([
      buildRecord({ id: 'visible', deletedAt: null }),
      buildRecord({ id: 'deleted', deletedAt: '2026-06-06T00:00:00.000Z' }),
    ]);

    expect(visible.map((record) => record.id)).toEqual(['visible']);
  });

  it('autocompleta por empleado desde Plantilla y sugiere por nombre o nº empleado', () => {
    const employees = [
      buildEmployee({ empleado: '10', nombreApellidos: 'Ane García' }),
      buildEmployee({ empleado: '2', nombreApellidos: 'Jon López' }),
      buildEmployee({ empleado: '3', nombreApellidos: 'Baja Persona', deletedAt: '2026-01-01' }),
    ];

    expect(findEmployeeByNumber(employees, '10')).toEqual({
      empleado: '10',
      nombreApellidos: 'Ane García',
    });
    expect(suggestEmployees(employees, 'jon')).toEqual([
      { empleado: '2', nombreApellidos: 'Jon López' },
    ]);
    expect(suggestEmployees(employees, '10')).toEqual([
      { empleado: '10', nombreApellidos: 'Ane García' },
    ]);
  });
});
