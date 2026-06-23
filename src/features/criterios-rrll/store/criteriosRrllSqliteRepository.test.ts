import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CriterioRrll } from '../domain/criterioRrll';
import {
  deleteCriterioRrllInSqlite,
  hasCriteriosRrllSqliteRepository,
  loadCriteriosRrllFromSqlite,
  loadCriteriosRrllRecordsFromSqlite,
  saveCriteriosRrllToSqlite,
  saveCriterioRrllToSqlite,
} from './criteriosRrllSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

function criterio(overrides: Partial<CriterioRrll> = {}): CriterioRrll {
  return {
    id: 'criterio-1',
    tema: 'Tema SQLite',
    criterio: 'Criterio de prueba',
    estado: 'vigente',
    sentido: 'aprobado',
    fecha: '2026-06-10',
    responsable: '',
    observaciones: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function parseCriteriosArray(storageValue: string | null): CriterioRrll[] {
  return storageValue ? (JSON.parse(storageValue) as CriterioRrll[]) : [];
}

describe('criteriosRrllSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('detecta si el repositorio SQLite de criterios RRLL está disponible', () => {
    expect(hasCriteriosRrllSqliteRepository()).toBe(false);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadCriteriosRrllRecords: vi.fn(), saveCriteriosRrllRecordIfUnchanged: vi.fn() },
    });

    expect(hasCriteriosRrllSqliteRepository()).toBe(true);
  });

  it('devuelve null si SQLite no está activo para lectura (loadCriteriosRrllFromSqlite)', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadCriteriosRrllRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadCriteriosRrllFromSqlite(parseCriteriosArray)).resolves.toBeNull();
  });

  it('carga criterios desde snapshot SQLite activo envolviendo cada registro como array', async () => {
    const storedCriterio = criterio({ id: 'criterio-2', tema: 'Persistido' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadCriteriosRrllRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [
            {
              id: storedCriterio.id,
              value: JSON.stringify(storedCriterio),
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            },
          ],
        })),
      },
    });

    await expect(loadCriteriosRrllFromSqlite(parseCriteriosArray)).resolves.toEqual([storedCriterio]);
  });

  it('loadCriteriosRrllRecordsFromSqlite devuelve los registros crudos sin parsear', async () => {
    const rawRecord = {
      id: 'criterio-3',
      value: JSON.stringify(criterio({ id: 'criterio-3' })),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadCriteriosRrllRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [rawRecord],
        })),
      },
    });

    await expect(loadCriteriosRrllRecordsFromSqlite()).resolves.toEqual([rawRecord]);
  });

  it('loadCriteriosRrllRecordsFromSqlite devuelve null si SQLite no está activo', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadCriteriosRrllRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadCriteriosRrllRecordsFromSqlite()).resolves.toBeNull();
  });

  it('guarda criterio con expectedUpdatedAt y devuelve el resultado normalizado', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Criterio guardado.',
      currentUpdatedAt: timestamp,
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordIfUnchanged: saver },
    });

    const draft = criterio();
    const result = await saveCriterioRrllToSqlite(draft, 'previous-token');

    expect(saver).toHaveBeenCalledWith({
      id: 'criterio-1',
      value: JSON.stringify(draft),
      expectedUpdatedAt: 'previous-token',
    });
    expect(result).toEqual({ ok: true, message: 'Criterio guardado.', currentUpdatedAt: timestamp });
  });

  it('devuelve null si no existe saver SQLite para escritura', async () => {
    await expect(saveCriterioRrllToSqlite(criterio(), null)).resolves.toBeNull();
  });

  it('guarda un lote de criterios en una sola llamada IPC, no una por registro', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      results: [],
      message: '2 registros de Criterio RRLL guardados en SQLite.',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordsIfUnchanged: saver },
    });

    const draftA = criterio({ id: 'criterio-1' });
    const draftB = criterio({ id: 'criterio-2' });
    const result = await saveCriteriosRrllToSqlite([
      { record: draftA, expectedUpdatedAt: 'token-a' },
      { record: draftB, expectedUpdatedAt: null },
    ]);

    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith([
      { id: 'criterio-1', value: JSON.stringify(draftA), expectedUpdatedAt: 'token-a' },
      { id: 'criterio-2', value: JSON.stringify(draftB), expectedUpdatedAt: null },
    ]);
    expect(result).toEqual({
      ok: true,
      message: '2 registros de Criterio RRLL guardados en SQLite.',
      failedRecordId: undefined,
    });
  });

  it('no llama al saver de lote si la lista de registros está vacía', async () => {
    const saver = vi.fn();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordsIfUnchanged: saver },
    });

    const result = await saveCriteriosRrllToSqlite([]);

    expect(saver).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: 'Nada que importar.' });
  });

  it('devuelve null si no existe saver SQLite de lote para escritura', async () => {
    await expect(
      saveCriteriosRrllToSqlite([{ record: criterio(), expectedUpdatedAt: null }]),
    ).resolves.toBeNull();
  });

  it('propaga el conflicto de concurrencia de un registro del lote junto a su id', async () => {
    const saver = vi.fn(async () => ({
      ok: false,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      results: [
        {
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: '2026-06-18T00:00:00.000Z',
          message: 'Criterio RRLL ha sido modificado por otro usuario. Recarga antes de guardar.',
        },
      ],
      failedRecordId: 'criterio-2',
      message: 'Criterio RRLL ha sido modificado por otro usuario. Recarga antes de guardar.',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordsIfUnchanged: saver },
    });

    const result = await saveCriteriosRrllToSqlite([
      { record: criterio({ id: 'criterio-1' }), expectedUpdatedAt: 'token-a' },
      { record: criterio({ id: 'criterio-2' }), expectedUpdatedAt: 'stale-token' },
    ]);

    expect(result).toEqual({
      ok: false,
      message: 'Criterio RRLL ha sido modificado por otro usuario. Recarga antes de guardar.',
      failedRecordId: 'criterio-2',
    });
  });

  it('propaga el conflicto de concurrencia sin lanzar excepción', async () => {
    const saver = vi.fn(async () => ({
      ok: false,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'El criterio ha sido modificado por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordIfUnchanged: saver },
    });

    const result = await saveCriterioRrllToSqlite(criterio(), 'stale-token');

    expect(result).toEqual({
      ok: false,
      message: 'El criterio ha sido modificado por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    });
  });

  it('deleteCriterioRrllInSqlite marca deletedAt y reutiliza saveCriterioRrllToSqlite', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Criterio eliminado.',
      currentUpdatedAt: '2026-06-19T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveCriteriosRrllRecordIfUnchanged: saver },
    });

    const original = criterio({ id: 'criterio-4' });
    const result = await deleteCriterioRrllInSqlite(original, timestamp);

    expect(saver).toHaveBeenCalledTimes(1);
    const callArg = saver.mock.calls[0][0] as { id: string; value: string; expectedUpdatedAt: string | null };
    expect(callArg.id).toBe('criterio-4');
    expect(callArg.expectedUpdatedAt).toBe(timestamp);

    const sent = JSON.parse(callArg.value) as CriterioRrll;
    expect(sent.deletedAt).toBeTruthy();
    expect(sent.updatedAt).toBe(sent.deletedAt);
    expect(result).toEqual({ ok: true, message: 'Criterio eliminado.', currentUpdatedAt: '2026-06-19T00:00:00.000Z' });
  });
});
