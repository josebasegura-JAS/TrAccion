import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CriterioRrll } from '../domain/criterioRrll';
import { useCriteriosRrllStore } from './useCriteriosRrllStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function criterio(overrides: Partial<CriterioRrll> = {}): CriterioRrll {
  return {
    id: 'criterio-1',
    tema: 'Vacaciones',
    criterio: 'Criterio de prueba',
    estado: 'vigente',
    sentido: 'sin clasificar',
    fecha: '2026-06-01',
    responsable: 'RRLL',
    observaciones: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(criterios: CriterioRrll[], updatedAt: string) {
  return {
    status: activeStatus(),
    records: criterios.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
  };
}

describe('useCriteriosRrllStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useCriteriosRrllStore.setState({ criterios: [], selectedCriterioId: '' });
  });

  it('rechaza el guardado cuando otro usuario ha modificado el criterio entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const existingCriterio = criterio();
    const loader = vi.fn(async () => recordsSnapshot([existingCriterio], timestamp));
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'Este criterio ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadCriteriosRrllRecords: loader, saveCriteriosRrllRecordIfUnchanged: saver },
    });

    await useCriteriosRrllStore.getState().load();
    expect(useCriteriosRrllStore.getState().criterios).toHaveLength(1);

    const result = await useCriteriosRrllStore.getState().updateWithConcurrencyCheck(
      existingCriterio.id,
      {
        tema: existingCriterio.tema,
        criterio: 'Texto editado por este usuario',
        estado: existingCriterio.estado,
        sentido: existingCriterio.sentido,
        fecha: existingCriterio.fecha,
        responsable: existingCriterio.responsable,
        observaciones: existingCriterio.observaciones,
      },
      '2026-06-17T07:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificado por otro usuario/i);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(useCriteriosRrllStore.getState().criterios[0].criterio).toBe('Criterio de prueba');
  });

  it('permite el guardado cuando expectedUpdatedAt coincide con el valor vigente en SQLite', async () => {
    const existingCriterio = criterio();
    const loader = vi.fn(async () => recordsSnapshot([existingCriterio], timestamp));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Criterio guardado.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadCriteriosRrllRecords: loader, saveCriteriosRrllRecordIfUnchanged: saver },
    });

    await useCriteriosRrllStore.getState().load();
    expect(useCriteriosRrllStore.getState().criterios).toHaveLength(1);

    const result = await useCriteriosRrllStore.getState().updateWithConcurrencyCheck(
      existingCriterio.id,
      {
        tema: existingCriterio.tema,
        criterio: 'Texto actualizado',
        estado: existingCriterio.estado,
        sentido: existingCriterio.sentido,
        fecha: existingCriterio.fecha,
        responsable: existingCriterio.responsable,
        observaciones: existingCriterio.observaciones,
      },
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
  });

  it('reloadFromStorage no sustituye el estado ni pierde la selección activa si el contenido no ha cambiado', async () => {
    const existingCriterio = criterio();
    const loader = vi.fn(async () => recordsSnapshot([existingCriterio], timestamp));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadCriteriosRrllRecords: loader, saveCriteriosRrllRecordIfUnchanged: vi.fn() },
    });

    await useCriteriosRrllStore.getState().load();
    expect(useCriteriosRrllStore.getState().criterios).toHaveLength(1);

    // Simulamos que el usuario tiene seleccionado este criterio en la UI.
    useCriteriosRrllStore.getState().selectCriterio(existingCriterio.id);
    const criteriosBeforeReload = useCriteriosRrllStore.getState().criterios;

    await useCriteriosRrllStore.getState().reloadFromStorage();

    // La referencia de array debe mantenerse intacta y la selección activa
    // del usuario debe seguir siendo la misma.
    expect(useCriteriosRrllStore.getState().criterios).toBe(criteriosBeforeReload);
    expect(useCriteriosRrllStore.getState().selectedCriterioId).toBe(existingCriterio.id);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade un criterio nuevo, conservando la selección', async () => {
    const existingCriterio = criterio();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingCriterio], timestamp))
      .mockResolvedValueOnce(
        recordsSnapshot(
          [existingCriterio, criterio({ id: 'criterio-2', tema: 'Otro tema' })],
          '2026-06-17T09:00:00.000Z',
        ),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadCriteriosRrllRecords: loader, saveCriteriosRrllRecordIfUnchanged: vi.fn() },
    });

    await useCriteriosRrllStore.getState().load();
    expect(useCriteriosRrllStore.getState().criterios).toHaveLength(1);

    useCriteriosRrllStore.getState().selectCriterio(existingCriterio.id);

    await useCriteriosRrllStore.getState().reloadFromStorage();

    expect(useCriteriosRrllStore.getState().criterios).toHaveLength(2);
    expect(useCriteriosRrllStore.getState().selectedCriterioId).toBe(existingCriterio.id);
  });
});
