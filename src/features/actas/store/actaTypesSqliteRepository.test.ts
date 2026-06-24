import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActaTypeDefinition } from '../domain/acta';
import {
  deleteActaTypeInSqlite,
  hasActaTypesSqliteRepository,
  loadActaTypeRecordsFromSqlite,
  loadActaTypesFromSqlite,
  saveActaTypeToSqlite,
  saveActaTypesToSqlite,
} from './actaTypesSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

function actaType(overrides: Partial<ActaTypeDefinition> = {}): ActaTypeDefinition {
  return {
    id: 'acta-type-1',
    nombre: 'Mesa Técnica',
    disabled: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function parseActaTypesArray(storageValue: string | null): ActaTypeDefinition[] {
  return storageValue ? (JSON.parse(storageValue) as ActaTypeDefinition[]) : [];
}

describe('actaTypesSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('detecta si el repositorio SQLite de tipos de acta está disponible', () => {
    expect(hasActaTypesSqliteRepository()).toBe(false);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadActaTypeRecords: vi.fn(), saveActaTypeRecordIfUnchanged: vi.fn() },
    });

    expect(hasActaTypesSqliteRepository()).toBe(true);
  });

  it('devuelve null si SQLite no está activo para lectura (loadActaTypesFromSqlite)', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaTypeRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadActaTypesFromSqlite(parseActaTypesArray)).resolves.toBeNull();
  });

  it('carga tipos de acta desde snapshot SQLite activo envolviendo cada registro como array', async () => {
    const storedType = actaType({ id: 'acta-type-2', nombre: 'Comité de Seguridad' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaTypeRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [
            {
              id: storedType.id,
              value: JSON.stringify(storedType),
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            },
          ],
        })),
      },
    });

    await expect(loadActaTypesFromSqlite(parseActaTypesArray)).resolves.toEqual([storedType]);
  });

  it('loadActaTypeRecordsFromSqlite devuelve los registros crudos sin parsear', async () => {
    const rawRecord = {
      id: 'acta-type-3',
      value: JSON.stringify(actaType({ id: 'acta-type-3' })),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaTypeRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [rawRecord],
        })),
      },
    });

    await expect(loadActaTypeRecordsFromSqlite()).resolves.toEqual([rawRecord]);
  });

  it('loadActaTypeRecordsFromSqlite devuelve null si SQLite no está activo', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaTypeRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadActaTypeRecordsFromSqlite()).resolves.toBeNull();
  });

  it('guarda tipo de acta con expectedUpdatedAt y devuelve el resultado normalizado', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Tipo de acta guardado.',
      currentUpdatedAt: timestamp,
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordIfUnchanged: saver },
    });

    const draft = actaType();
    const result = await saveActaTypeToSqlite(draft, 'previous-token');

    expect(saver).toHaveBeenCalledWith({
      id: 'acta-type-1',
      value: JSON.stringify(draft),
      expectedUpdatedAt: 'previous-token',
    });
    expect(result).toEqual({ ok: true, message: 'Tipo de acta guardado.', currentUpdatedAt: timestamp });
  });

  it('devuelve null si no existe saver SQLite para escritura', async () => {
    await expect(saveActaTypeToSqlite(actaType(), null)).resolves.toBeNull();
  });

  it('guarda un lote de tipos de acta en una sola llamada IPC, no una por registro', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      results: [],
      message: '2 registros de Tipo de acta guardados en SQLite.',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordsIfUnchanged: saver },
    });

    const draftA = actaType({ id: 'acta-type-1' });
    const draftB = actaType({ id: 'acta-type-2' });
    const result = await saveActaTypesToSqlite([
      { record: draftA, expectedUpdatedAt: 'token-a' },
      { record: draftB, expectedUpdatedAt: null },
    ]);

    expect(saver).toHaveBeenCalledTimes(1);
    expect(saver).toHaveBeenCalledWith([
      { id: 'acta-type-1', value: JSON.stringify(draftA), expectedUpdatedAt: 'token-a' },
      { id: 'acta-type-2', value: JSON.stringify(draftB), expectedUpdatedAt: null },
    ]);
    expect(result).toEqual({
      ok: true,
      message: '2 registros de Tipo de acta guardados en SQLite.',
      failedRecordId: undefined,
    });
  });

  it('no llama al saver de lote si la lista de registros está vacía', async () => {
    const saver = vi.fn();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordsIfUnchanged: saver },
    });

    const result = await saveActaTypesToSqlite([]);

    expect(saver).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, message: 'Nada que importar.' });
  });

  it('devuelve null si no existe saver SQLite de lote para escritura', async () => {
    await expect(
      saveActaTypesToSqlite([{ record: actaType(), expectedUpdatedAt: null }]),
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
          message: 'Tipo de acta ha sido modificado por otro usuario. Recarga antes de guardar.',
        },
      ],
      failedRecordId: 'acta-type-2',
      message: 'Tipo de acta ha sido modificado por otro usuario. Recarga antes de guardar.',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordsIfUnchanged: saver },
    });

    const result = await saveActaTypesToSqlite([
      { record: actaType({ id: 'acta-type-1' }), expectedUpdatedAt: 'token-a' },
      { record: actaType({ id: 'acta-type-2' }), expectedUpdatedAt: 'stale-token' },
    ]);

    expect(result).toEqual({
      ok: false,
      message: 'Tipo de acta ha sido modificado por otro usuario. Recarga antes de guardar.',
      failedRecordId: 'acta-type-2',
    });
  });

  it('propaga el conflicto de concurrencia sin lanzar excepción', async () => {
    const saver = vi.fn(async () => ({
      ok: false,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'El tipo de acta ha sido modificado por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordIfUnchanged: saver },
    });

    const result = await saveActaTypeToSqlite(actaType(), 'stale-token');

    expect(result).toEqual({
      ok: false,
      message: 'El tipo de acta ha sido modificado por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    });
  });

  it('deleteActaTypeInSqlite marca deletedAt y reutiliza saveActaTypeToSqlite', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Tipo de acta eliminado.',
      currentUpdatedAt: '2026-06-19T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaTypeRecordIfUnchanged: saver },
    });

    const original = actaType({ id: 'acta-type-4' });
    const result = await deleteActaTypeInSqlite(original, timestamp);

    expect(saver).toHaveBeenCalledTimes(1);
    const callArg = saver.mock.calls[0][0] as { id: string; value: string; expectedUpdatedAt: string | null };
    expect(callArg.id).toBe('acta-type-4');
    expect(callArg.expectedUpdatedAt).toBe(timestamp);

    const sent = JSON.parse(callArg.value) as ActaTypeDefinition;
    expect(sent.deletedAt).toBeTruthy();
    expect(sent.updatedAt).toBe(sent.deletedAt);
    expect(result).toEqual({ ok: true, message: 'Tipo de acta eliminado.', currentUpdatedAt: '2026-06-19T00:00:00.000Z' });
  });
});
