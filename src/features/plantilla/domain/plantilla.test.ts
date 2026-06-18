import { File as NodeFile } from 'node:buffer';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEmployeeStore } from '../store/useEmployeeStore';
import { buildDireccionTeletrabajo, buildResidenciaEus, hydrateEmployee, normalizeDni } from './derived';
import { EMPTY_EMPLOYEE_FILTERS } from './filters';
import { rowsToEmployeeDrafts } from './importExcel';

const existingEmployee = hydrateEmployee({
  empleado: '100',
  nombreApellidos: 'Ane Bilbao',
  puestoNomina: 'Técnica RRLL',
  puestoOrganizativo: 'Gestión Laboral',
  residencia: 'Oficinas Centrales',
  nivelRetributivo: '12',
  direccionOrganizativa: 'Capital Humano',
  antiguedadPuesto: '2020-01-01',
  sexo: 'F',
  calle: 'Gran Vía',
  numero: '12',
  piso: '3ºA',
  codigoPostal: '48001',
  poblacion: 'Bilbao',
  provincia: 'Bizkaia',
  nif: 'ES 12345678 z',
});

describe('plantilla derived field helpers', () => {
  it('normaliza NIF eliminando prefijo ES, espacios y convirtiendo a mayúsculas', () => {
    expect(normalizeDni(' ES 12345678 z ')).toBe('12345678Z');
    expect(normalizeDni('es44555111a')).toBe('44555111A');
  });

  it('construye residenciaEus para residencias conocidas y conserva el resto', () => {
    expect(buildResidenciaEus('Oficinas Centrales')).toBe('Bulego Nagusiak');
    expect(buildResidenciaEus('Sopela Taller')).toBe('Sopela Tailerra');
    expect(buildResidenciaEus('Ariz Taller')).toBe('Ariz Tailerra');
    expect(buildResidenciaEus('Lutxana')).toBe('Lutxana');
  });

  it('concatena la dirección de teletrabajo sin dobles espacios ni separadores extra', () => {
    expect(
      buildDireccionTeletrabajo({
        calle: 'Gran Vía',
        numero: '12',
        piso: '3ºA',
        codigoPostal: '48001',
        poblacion: 'Bilbao',
        provincia: 'Bizkaia',
      }),
    ).toBe('Gran Vía 12 3ºA 48001 Bilbao Bizkaia');
  });
});

describe('plantilla import', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useEmployeeStore.setState({
      employees: [existingEmployee],
      selectedEmployeeId: existingEmployee.empleado,
      filters: EMPTY_EMPLOYEE_FILTERS,
    });
  });

  it('importa cabeceras reales con tildes y variantes humanas', () => {
    expect(
      rowsToEmployeeDrafts([
        [
          'Nº empleado',
          'Nombre completo',
          'Puesto Nómina',
          'Puesto organización',
          'Centro de trabajo',
          'Grupo retributivo',
          'Género',
          'Dirección',
          'Número',
          'Planta',
          'Código Postal',
          'Población',
          'Territorio',
          'Documento identidad',
        ],
        [
          '101',
          'Iker Bilbao',
          'Técnico RRLL',
          'Gestión Laboral',
          'Oficinas Centrales',
          '12',
          'M',
          'Gran Vía',
          '14',
          '2ºB',
          '48001',
          'Bilbao',
          'Bizkaia',
          'es 44555111 a',
        ],
      ]),
    ).toEqual([
      expect.objectContaining({
        empleado: '101',
        nombreApellidos: 'Iker Bilbao',
        puestoNomina: 'Técnico RRLL',
        puestoOrganizativo: 'Gestión Laboral',
        residencia: 'Oficinas Centrales',
        nivelRetributivo: '12',
        sexo: 'M',
        calle: 'Gran Vía',
        numero: '14',
        piso: '2ºB',
        codigoPostal: '48001',
        poblacion: 'Bilbao',
        provincia: 'Bizkaia',
        nif: 'es 44555111 a',
      }),
    ]);
  });

  it('ignora columnas desconocidas y descarta filas sin empleado', () => {
    expect(
      rowsToEmployeeDrafts([
        ['empleado', 'nombreApellidos', 'campo desconocido', 'nif'],
        ['', 'Sin Código', 'ignorado', '11111111A'],
        ['101', 'Iker Bilbao', 'ignorado', 'es 44555111 a'],
      ]),
    ).toEqual([
      expect.objectContaining({
        empleado: '101',
        nombreApellidos: 'Iker Bilbao',
        nif: 'es 44555111 a',
      }),
    ]);
  });

  it('no duplica borradores cuando el empleado aparece repetido en el fichero', () => {
    expect(
      rowsToEmployeeDrafts([
        ['empleado', 'nombreApellidos'],
        ['101', 'Iker Bilbao'],
        ['101', 'Iker Bilbao Actualizado'],
      ]),
    ).toEqual([
      expect.objectContaining({
        empleado: '101',
        nombreApellidos: 'Iker Bilbao Actualizado',
      }),
    ]);
  });

  it('actualiza por empleado al importar sin duplicar registros y recalcula derivados', async () => {
    const file: File = new NodeFile(
      ['empleado;nombreApellidos;residencia;nif\n100;Ane Bilbao Actualizada;Sopela Taller;72451233H'],
      'plantilla.csv',
      { type: 'text/csv' },
    );

    await useEmployeeStore.getState().importExcel(file);

    const employees = useEmployeeStore.getState().employees;
    expect(employees.filter((employee) => employee.empleado === '100')).toHaveLength(1);
    expect(employees).toEqual([
      expect.objectContaining({
        empleado: '100',
        nombreApellidos: 'Ane Bilbao Actualizada',
        residencia: 'Sopela Taller',
        residenciaEus: 'Sopela Tailerra',
        dni: '72451233H',
      }),
    ]);
  });
});
