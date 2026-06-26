import { describe, expect, it, vi } from 'vitest';
import { createVinculogramaRepository } from './vinculogramaRepository';

/**
 * createJsonModuleRepository se inyecta como dependencia (ver el
 * comentario en vinculogramaRepository.ts), así que aquí se mockea de
 * forma mínima: solo hace falta verificar con qué parámetros se llama y
 * que las funciones devueltas delegan correctamente en el repositorio
 * resultante.
 */
describe('createVinculogramaRepository', () => {
  it('llama a createJsonModuleRepository con la tabla, key legacy y label correctos', () => {
    const repository = { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    createVinculogramaRepository(createJsonModuleRepository);

    expect(createJsonModuleRepository).toHaveBeenCalledTimes(1);
    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('vinculograma_records');
    expect(legacyKey).toBe('traccion.v1.vinculograma.records');
    expect(moduleLabel).toBe('Vinculograma');
  });

  it('el flag de migración empieza en false y se puede actualizar a través de los callbacks inyectados', () => {
    let capturedGetMigrationDone: (() => boolean) | null = null;
    let capturedSetMigrationDone: ((value: boolean) => void) | null = null;
    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
        setMigrationDone: (value: boolean) => void,
      ) => {
        capturedGetMigrationDone = getMigrationDone;
        capturedSetMigrationDone = setMigrationDone;
        return { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
      },
    );

    createVinculogramaRepository(createJsonModuleRepository);

    expect(capturedGetMigrationDone?.()).toBe(false);
    capturedSetMigrationDone?.(true);
    expect(capturedGetMigrationDone?.()).toBe(true);
  });

  it('loadVinculogramaRecordsSnapshot delega en repository.loadSnapshot', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(),
      saveManyIfUnchanged: vi.fn(),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const { loadVinculogramaRecordsSnapshot } = createVinculogramaRepository(createJsonModuleRepository);
    const result = await loadVinculogramaRecordsSnapshot();

    expect(repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it('saveVinculogramaRecordIfUnchanged delega en repository.saveIfUnchanged con el mismo registro', async () => {
    const saveResult = { ok: true, status: { ready: true, engine: 'sqlite', phase: 'active' }, currentUpdatedAt: '2026-01-01', message: 'ok' };
    const repository = {
      loadSnapshot: vi.fn(),
      saveIfUnchanged: vi.fn(async () => saveResult),
      saveManyIfUnchanged: vi.fn(),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const { saveVinculogramaRecordIfUnchanged } = createVinculogramaRepository(createJsonModuleRepository);
    const record = { id: 'abc', value: '{}', expectedUpdatedAt: null };
    const result = await saveVinculogramaRecordIfUnchanged(record);

    expect(repository.saveIfUnchanged).toHaveBeenCalledWith(record);
    expect(result).toBe(saveResult);
  });

  it('dos llamadas a createVinculogramaRepository tienen flags de migración independientes', () => {
    const getMigrationDoneByCall: Array<() => boolean> = [];
    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
        setMigrationDone: (value: boolean) => void,
      ) => {
        getMigrationDoneByCall.push(getMigrationDone);
        setMigrationDone(false);
        return { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
      },
    );

    createVinculogramaRepository(createJsonModuleRepository);
    createVinculogramaRepository(createJsonModuleRepository);

    expect(getMigrationDoneByCall).toHaveLength(2);
    expect(getMigrationDoneByCall[0]).not.toBe(getMigrationDoneByCall[1]);
  });
});
