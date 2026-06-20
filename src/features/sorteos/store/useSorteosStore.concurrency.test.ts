import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SorteosDraw, SorteosExclusion, SorteosPerson } from '../domain/sorteos';
import { useSorteosStore } from './useSorteosStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function person(overrides: Partial<SorteosPerson> = {}): SorteosPerson {
  const empleado = overrides.empleado ?? '1001';
  const nombreApellidos = overrides.nombreApellidos ?? 'Ana García López';
  return {
    empleado,
    nombreApellidos,
    searchText: `${empleado} ${nombreApellidos}`.toLowerCase(),
    ...overrides,
  };
}

function draw(overrides: Partial<SorteosDraw> = {}): SorteosDraw {
  return {
    id: 'draw-1',
    title: 'Sorteo junio',
    date: '2026-06-17',
    winners: [{ position: 1, empleado: '1001', nombreApellidos: 'Ana García López' }],
    createdAt: timestamp,
    ...overrides,
  };
}

function exclusion(overrides: Partial<SorteosExclusion> = {}): SorteosExclusion {
  return {
    id: 'exclusion-1',
    empleado: '1001',
    nombreApellidos: 'Ana García López',
    reason: 'Manual',
    drawId: null,
    createdAt: timestamp,
    excludedAt: timestamp,
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function sqliteRecordsSnapshot(draws: SorteosDraw[], exclusions: SorteosExclusion[], updatedAt: string) {
  return {
    status: activeStatus(),
    draws: draws.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
    exclusions: exclusions.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
    drawsUpdatedAt: updatedAt,
    exclusionsUpdatedAt: updatedAt,
  };
}

describe('useSorteosStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useSorteosStore.setState({ draws: [], exclusions: [], visibleDrawId: '', visibleResult: null });
  });

  it('rechaza el guardado cuando otro usuario ha cambiado los sorteos entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const existingDraw = draw();
    const loader = vi.fn(async () =>
      sqliteRecordsSnapshot([existingDraw], [], '2026-06-17T08:00:00.000Z'),
    );
    // El saver simula que otro usuario ha escrito justo antes: el
    // expectedDrawsUpdatedAt que envía este cliente ya no coincide con el
    // valor actual en SQLite, así que la operación debe fallar sin guardar.
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentDrawsUpdatedAt: '2026-06-17T08:05:00.000Z',
      currentExclusionsUpdatedAt: null,
      message: 'Los sorteos han cambiado mientras guardabas. Recarga antes de continuar para no sobrescribir cambios.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadSorteosRecords: loader, saveSorteosSnapshotIfUnchanged: saver },
    });

    useSorteosStore.getState().load();
    await vi.waitFor(() => expect(useSorteosStore.getState().draws).toHaveLength(1));

    const result = await useSorteosStore.getState().createDrawWithConcurrencyCheck(
      { title: 'Sorteo nuevo', date: '2026-06-17', winnersCount: 1 },
      [person(), person({ empleado: '1002', nombreApellidos: 'Bea Ruiz' })],
    );

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/han cambiado mientras guardabas/i);
    expect(saver).toHaveBeenCalledTimes(1);
    // El sorteo nuevo NO debe haberse añadido al estado local: el conflicto
    // impide sobrescribir lo que hay en la base compartida.
    expect(useSorteosStore.getState().draws).toEqual([existingDraw]);
  });

  it('permite el guardado cuando expectedUpdatedAt coincide con el valor vigente en SQLite', async () => {
    const loader = vi.fn(async () => sqliteRecordsSnapshot([], [], timestamp));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentDrawsUpdatedAt: '2026-06-17T08:10:00.000Z',
      currentExclusionsUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Sorteos guardados en SQLite.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadSorteosRecords: loader, saveSorteosSnapshotIfUnchanged: saver },
    });

    const result = await useSorteosStore.getState().createDrawWithConcurrencyCheck(
      { title: 'Sorteo sin conflicto', date: '2026-06-17', winnersCount: 1 },
      [person()],
    );

    expect(result.valid).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(useSorteosStore.getState().draws).toHaveLength(1);
    expect(useSorteosStore.getState().draws[0].title).toBe('Sorteo sin conflicto');
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    const existingDraw = draw();
    const existingExclusion = exclusion();
    const loader = vi.fn(async () =>
      sqliteRecordsSnapshot([existingDraw], [existingExclusion], timestamp),
    );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadSorteosRecords: loader, saveSorteosSnapshotIfUnchanged: vi.fn() },
    });

    useSorteosStore.getState().load();
    await vi.waitFor(() => expect(useSorteosStore.getState().draws).toHaveLength(1));

    const drawsBeforeReload = useSorteosStore.getState().draws;
    const exclusionsBeforeReload = useSorteosStore.getState().exclusions;

    // El polling detecta un cambio de updatedAt (por ejemplo, porque el
    // cambio lo hicimos nosotros mismos en otra pestaña), pero el contenido
    // normalizado que devuelve SQLite es idéntico al que ya tenemos.
    useSorteosStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // Las referencias de array deben mantenerse intactas: reloadFromStorage
    // no debe haber llamado a set() si el contenido no cambió realmente.
    expect(useSorteosStore.getState().draws).toBe(drawsBeforeReload);
    expect(useSorteosStore.getState().exclusions).toBe(exclusionsBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade un sorteo nuevo', async () => {
    const existingDraw = draw();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(sqliteRecordsSnapshot([existingDraw], [], timestamp))
      .mockResolvedValueOnce(
        sqliteRecordsSnapshot([existingDraw, draw({ id: 'draw-2', title: 'Sorteo de otro usuario' })], [], '2026-06-17T09:00:00.000Z'),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadSorteosRecords: loader, saveSorteosSnapshotIfUnchanged: vi.fn() },
    });

    useSorteosStore.getState().load();
    await vi.waitFor(() => expect(useSorteosStore.getState().draws).toHaveLength(1));

    useSorteosStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(useSorteosStore.getState().draws).toHaveLength(2));
    expect(useSorteosStore.getState().draws.map((item) => item.id).sort()).toEqual(['draw-1', 'draw-2']);
  });
});
