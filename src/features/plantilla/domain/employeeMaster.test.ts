import { describe, expect, it } from 'vitest';
import type { Employee } from './employee';
import {
  buildActiveEmployeeMap,
  findActiveEmployee,
  normalizeEmployeeNumber,
  searchActiveEmployees,
  sameEmployeeNumber,
} from './employeeMaster';

function employee(partial: Partial<Employee>): Employee {
  return {
    empleado: '',
    nombreApellidos: '',
    puestoNomina: '',
    puestoOrganizativo: '',
    puestoEus: '',
    residencia: '',
    unidad: '',
    nivelRetributivo: '',
    direccionOrganizativa: '',
    antiguedadPuesto: '',
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
    ...partial,
  };
}

describe('Plantilla como fuente maestra de personas', () => {
  it('normaliza variantes numéricas habituales de Excel', () => {
    expect(normalizeEmployeeNumber('00123')).toBe('123');
    expect(normalizeEmployeeNumber('123.0')).toBe('123');
    expect(normalizeEmployeeNumber(' EXT-12 ')).toBe('EXT-12');
    expect(sameEmployeeNumber('00123', '123.0')).toBe(true);
  });

  it('localiza solo personas activas usando la clave normalizada', () => {
    const employees = [
      employee({ empleado: '00123', nombreApellidos: 'Ane García' }),
      employee({ empleado: '124', nombreApellidos: 'Baja', deletedAt: '2026-01-01' }),
    ];

    expect(findActiveEmployee(employees, '123')?.nombreApellidos).toBe('Ane García');
    expect(findActiveEmployee(employees, '124')).toBeNull();
  });

  it('busca por nombre sin depender de tildes y por nº de empleado', () => {
    const employees = [
      employee({ empleado: '0010', nombreApellidos: 'Álvaro Núñez' }),
      employee({ empleado: '2', nombreApellidos: 'Bea Ruiz' }),
    ];

    expect(searchActiveEmployees(employees, 'alvaro').map((item) => item.empleado)).toEqual(['0010']);
    expect(searchActiveEmployees(employees, '10').map((item) => item.empleado)).toEqual(['0010']);
  });

  it('construye un mapa canónico por nº de empleado', () => {
    const ane = employee({ empleado: '0007', nombreApellidos: 'Ane' });
    const map = buildActiveEmployeeMap([ane]);
    expect(map.get('7')).toBe(ane);
  });
});
