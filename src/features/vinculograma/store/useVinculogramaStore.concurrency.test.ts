import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vinculograma } from '../domain/vinculograma';
import { useVinculogramaStore } from './useVinculogramaStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function vinculo(overrides: Partial<Vinculograma> = {}): Vinculograma {
  return {
    id: 'vinculo-1',
    employeeNumber: '1001',
    nombreCompleto: 'Ana García López',
    linkedPerson: 'Carlos García',
    requestDate: '2026-06-01',
    expiryDate: '2026-12-01',
    revokedAt: '',
    revocationReason: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(vinculos: Vinculograma[], updatedAt: string) {
  return {
    status: activeStatus(),
    records: vinculos.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
  };
}

describe('useVinculogramaStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useVinculogramaStore.setState({ records: [] });
  });

  it('rechaza el guardado cuando otro usuario ha modificado el vínculo entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const existingVinculo = vinculo();
    const loader = vi.fn(async () => recordsSnapshot([existingVinculo], timestamp));
    // El saver simula que otro usuario ha modificado este vínculo justo
    // antes: el expectedUpdatedAt que envía este cliente ya no coincide con
    // el valor vigente en SQLite, así que la operación debe fallar.
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'Este vínculo ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadVinculogramaRecords: loader, saveVinculogramaRecordIfUnchanged: saver },
    });

    await useVinculogramaStore.getState().load();
    expect(useVinculogramaStore.getState().records).toHaveLength(1);

    const result = await useVinculogramaStore.getState().updateWithConcurrencyCheck(
      existingVinculo.id,
      {
        employeeNumber: existingVinculo.employeeNumber,
        nombreCompleto: existingVinculo.nombreCompleto,
        linkedPerson: 'Otro vínculo editado',
        requestDate: existingVinculo.requestDate,
        expiryDate: existingVinculo.expiryDate,
      },
      // expectedUpdatedAt deliberadamente obsoleto, distinto del que ya
      // tiene SQLite, para simular el cambio de otro usuario.
      '2026-06-17T07:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificado por otro usuario/i);
    expect(saver).toHaveBeenCalledTimes(1);
    // El vínculo local NO debe haberse actualizado: el conflicto impide
    // sobrescribir lo que hay en la base compartida.
    expect(useVinculogramaStore.getState().records[0].linkedPerson).toBe('Carlos García');
  });

  it('permite el guardado cuando expectedUpdatedAt coincide con el valor vigente en SQLite', async () => {
    const existingVinculo = vinculo();
    const loader = vi.fn(async () => recordsSnapshot([existingVinculo], timestamp));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Vínculo guardado.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadVinculogramaRecords: loader, saveVinculogramaRecordIfUnchanged: saver },
    });

    await useVinculogramaStore.getState().load();
    expect(useVinculogramaStore.getState().records).toHaveLength(1);

    const result = await useVinculogramaStore.getState().updateWithConcurrencyCheck(
      existingVinculo.id,
      {
        employeeNumber: existingVinculo.employeeNumber,
        nombreCompleto: existingVinculo.nombreCompleto,
        linkedPerson: 'Vínculo actualizado',
        requestDate: existingVinculo.requestDate,
        expiryDate: existingVinculo.expiryDate,
      },
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    const existingVinculo = vinculo();
    const loader = vi.fn(async () => recordsSnapshot([existingVinculo], timestamp));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadVinculogramaRecords: loader, saveVinculogramaRecordIfUnchanged: vi.fn() },
    });

    await useVinculogramaStore.getState().load();
    expect(useVinculogramaStore.getState().records).toHaveLength(1);

    const recordsBeforeReload = useVinculogramaStore.getState().records;

    // El polling detecta un cambio (por ejemplo, generado por nuestra propia
    // escritura en otra pestaña), pero el contenido normalizado que devuelve
    // SQLite es idéntico al que ya tenemos.
    await useVinculogramaStore.getState().reloadFromStorage();

    // La referencia de array debe mantenerse intacta: reloadFromStorage no
    // debe haber llamado a set() si el contenido no cambió realmente.
    expect(useVinculogramaStore.getState().records).toBe(recordsBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade un vínculo nuevo', async () => {
    const existingVinculo = vinculo();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingVinculo], timestamp))
      .mockResolvedValueOnce(
        recordsSnapshot(
          [existingVinculo, vinculo({ id: 'vinculo-2', employeeNumber: '1002', nombreCompleto: 'Bea Ruiz' })],
          '2026-06-17T09:00:00.000Z',
        ),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadVinculogramaRecords: loader, saveVinculogramaRecordIfUnchanged: vi.fn() },
    });

    await useVinculogramaStore.getState().load();
    expect(useVinculogramaStore.getState().records).toHaveLength(1);

    await useVinculogramaStore.getState().reloadFromStorage();

    expect(useVinculogramaStore.getState().records).toHaveLength(2);
    expect(useVinculogramaStore.getState().records.map((item) => item.id).sort()).toEqual([
      'vinculo-1',
      'vinculo-2',
    ]);
  });
});
