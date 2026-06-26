import { describe, expect, it, vi } from 'vitest';
import { createSimpleDomainRepository } from './simpleDomainRepositoryFactory';

describe('createSimpleDomainRepository', () => {
  it('llama a createJsonModuleRepository con la tabla, key legacy y label dados', () => {
    const repository = { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    createSimpleDomainRepository(createJsonModuleRepository, 'mi_tabla', 'mi.legacy.key', 'Mi módulo');

    expect(createJsonModuleRepository).toHaveBeenCalledTimes(1);
    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('mi_tabla');
    expect(legacyKey).toBe('mi.legacy.key');
    expect(moduleLabel).toBe('Mi módulo');
  });

  it('el flag de migración empieza en false y queda encapsulado (no accesible desde fuera)', () => {
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

    const api = createSimpleDomainRepository(createJsonModuleRepository, 't', 'k', 'L');

    expect(capturedGetMigrationDone?.()).toBe(false);
    capturedSetMigrationDone?.(true);
    expect(capturedGetMigrationDone?.()).toBe(true);
    expect(Object.keys(api)).toEqual(['loadSnapshot', 'saveIfUnchanged']);
  });

  it('loadSnapshot y saveIfUnchanged delegan en el repositorio devuelto por createJsonModuleRepository', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const saveResult = {
      ok: true,
      status: { ready: true, engine: 'sqlite', phase: 'active' },
      currentUpdatedAt: '2026-01-01',
      message: 'ok',
    };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(async () => saveResult),
      saveManyIfUnchanged: vi.fn(),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createSimpleDomainRepository(createJsonModuleRepository, 't', 'k', 'L');
    const record = { id: '1', value: '{}', expectedUpdatedAt: null };

    expect(await api.loadSnapshot()).toBe(snapshot);
    expect(await api.saveIfUnchanged(record)).toBe(saveResult);
    expect(repository.saveIfUnchanged).toHaveBeenCalledWith(record);
  });

  it('dos llamadas tienen flags de migración completamente independientes entre sí', () => {
    const getters: Array<() => boolean> = [];
    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
        setMigrationDone: (value: boolean) => void,
      ) => {
        getters.push(getMigrationDone);
        setMigrationDone(false);
        return { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
      },
    );

    createSimpleDomainRepository(createJsonModuleRepository, 't1', 'k1', 'L1');
    createSimpleDomainRepository(createJsonModuleRepository, 't2', 'k2', 'L2');

    expect(getters[0]).not.toBe(getters[1]);
  });
});
