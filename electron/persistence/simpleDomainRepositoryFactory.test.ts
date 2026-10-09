import { describe, expect, it, vi } from 'vitest';
import { createBatchDomainRepository, createSimpleDomainRepository } from './simpleDomainRepositoryFactory';

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

  it('revalida la migración al cambiar A → B → A y no deja B sin migrar', async () => {
    let activeDatabase = 'A';
    const databasesAlreadyMigrated = new Set<string>();
    const migrationChecks: string[] = [];
    const actualMigrations: string[] = [];

    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
        setMigrationDone: (value: boolean) => void,
      ) => {
        const ensureMigration = () => {
          if (getMigrationDone()) return;
          migrationChecks.push(activeDatabase);
          if (!databasesAlreadyMigrated.has(activeDatabase)) {
            databasesAlreadyMigrated.add(activeDatabase);
            actualMigrations.push(activeDatabase);
          }
          setMigrationDone(true);
        };

        return {
          loadSnapshot: vi.fn(async () => {
            ensureMigration();
            return { status: {} as never, records: [] };
          }),
          saveIfUnchanged: vi.fn(async () => {
            ensureMigration();
            return { ok: true, status: {} as never, currentUpdatedAt: null, message: 'ok' };
          }),
          saveManyIfUnchanged: vi.fn(),
        };
      },
    );

    const api = createSimpleDomainRepository(createJsonModuleRepository, 't', 'k', 'L');
    await api.loadSnapshot();

    activeDatabase = 'B';
    await api.saveIfUnchanged({ id: '1', value: '{}', expectedUpdatedAt: null });

    activeDatabase = 'A';
    await api.loadSnapshot();

    expect(migrationChecks).toEqual(['A', 'B', 'A']);
    expect(actualMigrations).toEqual(['A', 'B']);
  });
});

describe('createBatchDomainRepository', () => {
  it('expone loadSnapshot, saveIfUnchanged y saveManyIfUnchanged, todos delegando en el repositorio', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const saveResult = {
      ok: true,
      status: { ready: true, engine: 'sqlite', phase: 'active' },
      currentUpdatedAt: '2026-01-01',
      message: 'ok',
    };
    const batchResult = {
      ok: true,
      status: { ready: true, engine: 'sqlite', phase: 'active' },
      results: [],
      message: '2 registros guardados.',
    };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(async () => saveResult),
      saveManyIfUnchanged: vi.fn(async () => batchResult),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createBatchDomainRepository(createJsonModuleRepository, 't', 'k', 'L');
    const record = { id: '1', value: '{}', expectedUpdatedAt: null };
    const records = [record, { id: '2', value: '{}', expectedUpdatedAt: null }];

    expect(await api.loadSnapshot()).toBe(snapshot);
    expect(await api.saveIfUnchanged(record)).toBe(saveResult);
    expect(await api.saveManyIfUnchanged(records)).toBe(batchResult);
    expect(repository.saveManyIfUnchanged).toHaveBeenCalledWith(records);
  });

  it('llama a createJsonModuleRepository con la tabla, key legacy y label dados', () => {
    const repository = { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    createBatchDomainRepository(createJsonModuleRepository, 'mi_tabla_batch', 'mi.legacy.batch', 'Mi módulo batch');

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('mi_tabla_batch');
    expect(legacyKey).toBe('mi.legacy.batch');
    expect(moduleLabel).toBe('Mi módulo batch');
  });

  it('el flag de migración empieza en false y queda encapsulado', () => {
    let capturedGetMigrationDone: (() => boolean) | null = null;
    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
      ) => {
        capturedGetMigrationDone = getMigrationDone;
        return { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
      },
    );

    createBatchDomainRepository(createJsonModuleRepository, 't', 'k', 'L');

    expect(capturedGetMigrationDone?.()).toBe(false);
  });

  it('invalida también la caché antes del guardado batch al cambiar de base', async () => {
    const observedMigrationState: boolean[] = [];
    let getMigrationDoneRef: (() => boolean) | null = null;
    let setMigrationDoneRef: ((value: boolean) => void) | null = null;

    const createJsonModuleRepository = vi.fn(
      (
        _tableName: string,
        _legacyKey: string,
        _moduleLabel: string,
        getMigrationDone: () => boolean,
        setMigrationDone: (value: boolean) => void,
      ) => {
        getMigrationDoneRef = getMigrationDone;
        setMigrationDoneRef = setMigrationDone;
        return {
          loadSnapshot: vi.fn(),
          saveIfUnchanged: vi.fn(),
          saveManyIfUnchanged: vi.fn(async () => {
            observedMigrationState.push(getMigrationDone());
            setMigrationDone(true);
            return { ok: true, status: {} as never, results: [], message: 'ok' };
          }),
        };
      },
    );

    const api = createBatchDomainRepository(createJsonModuleRepository, 't', 'k', 'L');
    setMigrationDoneRef?.(true);
    expect(getMigrationDoneRef?.()).toBe(true);

    await api.saveManyIfUnchanged([{ id: '1', value: '{}', expectedUpdatedAt: null }]);

    expect(observedMigrationState).toEqual([false]);
  });
});
