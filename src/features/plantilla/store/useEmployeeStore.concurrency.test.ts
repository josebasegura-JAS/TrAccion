import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hydrateEmployee } from '../domain/derived';
import { EMPTY_EMPLOYEE_DRAFT, type Employee } from '../domain/employee';
import { useEmployeeStore } from './useEmployeeStore';

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    ...hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '1001', nombreApellidos: 'Ana García López' }),
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(employees: Employee[], updatedAt: string) {
  return {
    status: activeStatus(),
    records: employees.map((item) => ({
      id: item.empleado,
      value: JSON.stringify(item),
      createdAt: updatedAt,
      updatedAt,
      deletedAt: null,
    })),
  };
}

describe('useEmployeeStore (Plantilla) concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useEmployeeStore.setState({ employees: [], selectedEmployeeId: '', lastLoadedAt: null });
  });

  it('rechaza el guardado cuando otro usuario ha modificado a la persona entre tanto (snapshot obsoleto)', async () => {
    const existingEmployee = employee();
    const loader = vi.fn(async () => recordsSnapshot([existingEmployee], '2026-06-17T08:00:00.000Z'));
    // El saver simula que otro usuario ha modificado esta persona justo
    // antes: el expectedValue (snapshot completo) que envía este cliente ya
    // no coincide con el valor vigente en SQLite, así que debe fallar.
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentValue: JSON.stringify({ ...existingEmployee, nombreApellidos: 'Cambiado por otro usuario' }),
      message: 'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEmployeeRecords: loader, saveEmployeeRecordIfUnchanged: saver },
    });

    useEmployeeStore.getState().load();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(1));

    const result = await useEmployeeStore.getState().updateWithConcurrencyCheck(
      existingEmployee.empleado,
      { ...EMPTY_EMPLOYEE_DRAFT, empleado: existingEmployee.empleado, nombreApellidos: 'Editado por este usuario' },
      // expectedSnapshot deliberadamente obsoleto (no coincide con el value
      // vigente en SQLite) para simular el cambio de otro usuario.
      JSON.stringify({ ...existingEmployee, nombreApellidos: 'Snapshot obsoleto' }),
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificada por otro usuario/i);
    expect(saver).toHaveBeenCalledTimes(1);
    // El nombre local NO debe haberse actualizado: el conflicto impide
    // sobrescribir lo que hay en la base compartida.
    expect(useEmployeeStore.getState().employees[0].nombreApellidos).toBe('Ana García López');
  });

  it('permite el guardado cuando el snapshot coincide con el valor vigente en SQLite', async () => {
    const existingEmployee = employee();
    const loader = vi.fn(async () => recordsSnapshot([existingEmployee], '2026-06-17T08:00:00.000Z'));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentValue: JSON.stringify({ ...existingEmployee, nombreApellidos: 'Editado por este usuario' }),
      message: 'Persona guardada.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEmployeeRecords: loader, saveEmployeeRecordIfUnchanged: saver },
    });

    useEmployeeStore.getState().load();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(1));

    const result = await useEmployeeStore.getState().updateWithConcurrencyCheck(
      existingEmployee.empleado,
      { ...EMPTY_EMPLOYEE_DRAFT, empleado: existingEmployee.empleado, nombreApellidos: 'Editado por este usuario' },
      JSON.stringify(existingEmployee),
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
  });


  it('permite guardar si SQLite devuelve el mismo empleado con JSON no canónico', async () => {
    const existingEmployee = employee({ puestoOrganizativo: 'Analisis informatico' });
    const nonCanonicalCurrentValue = JSON.stringify({
      nombreApellidos: existingEmployee.nombreApellidos,
      empleado: existingEmployee.empleado,
      puestoOrganizativo: existingEmployee.puestoOrganizativo,
      puestoNomina: existingEmployee.puestoNomina,
      puestoEus: existingEmployee.puestoEus,
      residencia: existingEmployee.residencia,
      unidad: existingEmployee.unidad,
      nivelRetributivo: existingEmployee.nivelRetributivo,
      direccionOrganizativa: existingEmployee.direccionOrganizativa,
      antiguedadPuesto: existingEmployee.antiguedadPuesto,
      sexo: existingEmployee.sexo,
      calle: existingEmployee.calle,
      numero: existingEmployee.numero,
      piso: existingEmployee.piso,
      codigoPostal: existingEmployee.codigoPostal,
      poblacion: existingEmployee.poblacion,
      provincia: existingEmployee.provincia,
      nif: existingEmployee.nif,
      deletedAt: existingEmployee.deletedAt,
    });
    const loader = vi.fn(async () => recordsSnapshot([existingEmployee], '2026-06-17T08:00:00.000Z'));
    const saver = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: activeStatus(),
        currentValue: nonCanonicalCurrentValue,
        message: 'Esta persona ha sido modificada por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: activeStatus(),
        currentValue: JSON.stringify({ ...existingEmployee, puestoOrganizativo: 'Nuevo puesto' }),
        message: 'Persona guardada.',
      });

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEmployeeRecords: loader, saveEmployeeRecordIfUnchanged: saver },
    });

    useEmployeeStore.getState().load();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(1));

    const result = await useEmployeeStore.getState().updateWithConcurrencyCheck(
      existingEmployee.empleado,
      {
        ...EMPTY_EMPLOYEE_DRAFT,
        empleado: existingEmployee.empleado,
        nombreApellidos: existingEmployee.nombreApellidos,
        puestoOrganizativo: 'Nuevo puesto',
      },
      JSON.stringify(existingEmployee),
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(2);
    expect(saver.mock.calls[1][0].expectedValue).toBe(nonCanonicalCurrentValue);
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    const existingEmployee = employee();
    const loader = vi.fn(async () => recordsSnapshot([existingEmployee], '2026-06-17T08:00:00.000Z'));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEmployeeRecords: loader, saveEmployeeRecordIfUnchanged: vi.fn() },
    });

    useEmployeeStore.getState().load();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(1));

    const employeesBeforeReload = useEmployeeStore.getState().employees;

    // El polling detecta un cambio (por ejemplo, generado por nuestra propia
    // escritura en otra pestaña), pero el contenido normalizado que devuelve
    // SQLite es idéntico al que ya tenemos en memoria.
    useEmployeeStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // La referencia de array debe mantenerse intacta: reloadFromStorage no
    // debe haber llamado a set() si el contenido no cambió realmente.
    expect(useEmployeeStore.getState().employees).toBe(employeesBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade una persona nueva', async () => {
    const existingEmployee = employee();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingEmployee], '2026-06-17T08:00:00.000Z'))
      .mockResolvedValueOnce(
        recordsSnapshot(
          [existingEmployee, employee({ empleado: '1002', nombreApellidos: 'Bea Ruiz' })],
          '2026-06-17T09:00:00.000Z',
        ),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEmployeeRecords: loader, saveEmployeeRecordIfUnchanged: vi.fn() },
    });

    useEmployeeStore.getState().load();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(1));

    useEmployeeStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(useEmployeeStore.getState().employees).toHaveLength(2));

    expect(useEmployeeStore.getState().employees.map((item) => item.empleado).sort()).toEqual([
      '1001',
      '1002',
    ]);
  });
});
