import { beforeEach, describe, expect, it } from 'vitest';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_DRAFT, type Employee } from '../domain/employee';
import type { JobPositionTranslation } from '../domain/jobPositionTranslation';
import { useEmployeeStore } from './useEmployeeStore';

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    ...hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '1001', nombreApellidos: 'Ana García López' }),
    ...overrides,
  };
}

describe('useEmployeeStore — syncMissingJobPositionTranslationsFromEmployees', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useEmployeeStore.setState({ employees: [], jobPositionTranslations: [] });
  });

  it('da de alta como pendiente (sin traducción) un puestoOrganizativo que no existe todavía', async () => {
    useEmployeeStore.setState({
      employees: [employee({ empleado: '1001', puestoOrganizativo: 'Técnica de Recursos' })],
    });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result).toEqual({ created: 1, createdPuestos: ['Técnica de Recursos'] });
    const translations = useEmployeeStore.getState().jobPositionTranslations;
    expect(translations).toEqual([{ puestoCastellano: 'Técnica de Recursos', puestoEuskera: '' }]);
  });

  it('no duplica ni toca la traducción existente cuando el puesto ya está dado de alta', async () => {
    const existingTranslation: JobPositionTranslation = {
      puestoCastellano: 'Técnica de Recursos',
      puestoEuskera: 'Baliabide Teknikaria',
    };
    useEmployeeStore.setState({
      employees: [employee({ empleado: '1001', puestoOrganizativo: 'Técnica de Recursos' })],
      jobPositionTranslations: [existingTranslation],
    });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result).toEqual({ created: 0, createdPuestos: [] });
    expect(useEmployeeStore.getState().jobPositionTranslations).toEqual([existingTranslation]);
  });

  it('compara por texto normalizado: acentos/mayúsculas/espacios distintos no generan un alta duplicada', async () => {
    useEmployeeStore.setState({
      employees: [employee({ empleado: '1001', puestoOrganizativo: '  técnica de recursos  ' })],
      jobPositionTranslations: [{ puestoCastellano: 'Técnica de Recursos', puestoEuskera: 'Baliabide Teknikaria' }],
    });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result).toEqual({ created: 0, createdPuestos: [] });
  });

  it('no cuenta empleados de baja (deletedAt) ni empleados sin puestoOrganizativo', async () => {
    useEmployeeStore.setState({
      employees: [
        employee({ empleado: '1001', puestoOrganizativo: 'Puesto de baja', deletedAt: '2026-06-01T00:00:00.000Z' }),
        employee({ empleado: '1002', puestoOrganizativo: '' }),
      ],
    });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result).toEqual({ created: 0, createdPuestos: [] });
  });

  it('deduplica varios empleados que comparten el mismo puestoOrganizativo nuevo en una sola alta', async () => {
    useEmployeeStore.setState({
      employees: [
        employee({ empleado: '1001', puestoOrganizativo: 'Técnica de Recursos' }),
        employee({ empleado: '1002', puestoOrganizativo: 'Técnica de Recursos' }),
        employee({ empleado: '1003', puestoOrganizativo: 'Conserje' }),
      ],
    });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result.created).toBe(2);
    expect(result.createdPuestos.sort()).toEqual(['Conserje', 'Técnica de Recursos']);
    expect(useEmployeeStore.getState().jobPositionTranslations).toHaveLength(2);
  });

  it('no llama a persistencia ni cambia el estado cuando no hay nada pendiente', async () => {
    useEmployeeStore.setState({ employees: [], jobPositionTranslations: [] });

    const result = await useEmployeeStore.getState().syncMissingJobPositionTranslationsFromEmployees();

    expect(result).toEqual({ created: 0, createdPuestos: [] });
    expect(useEmployeeStore.getState().jobPositionTranslations).toEqual([]);
  });
});
