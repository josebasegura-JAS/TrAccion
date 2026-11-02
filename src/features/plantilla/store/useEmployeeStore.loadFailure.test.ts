import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_DRAFT } from '../domain/employee';
import { useEmployeeStore } from './useEmployeeStore';

describe('Plantilla: fallo de lectura no equivale a plantilla vacía', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useEmployeeStore.setState({ employees: [], isLoading: false, lastLoadedAt: null });
  });
  it('conserva empleados previos cuando SQLite deja de estar disponible', async () => {
    const item = hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '1001', nombreApellidos: 'Prueba' });
    useEmployeeStore.setState({ employees: [item] });
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadEmployeeRecords: vi.fn(async () => ({ status: { ready: false, phase: 'reconnecting' }, records: [] })),
      saveEmployeeRecordIfUnchanged: vi.fn(),
    } });
    await expect(useEmployeeStore.getState().reloadFromStorage()).rejects.toThrow('plantilla compartida');
    expect(useEmployeeStore.getState().employees).toEqual([item]);
  });
});
