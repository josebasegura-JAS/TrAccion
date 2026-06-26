import { describe, expect, it, vi } from 'vitest';
import { createLicenciaSinSueldoRepository } from './licenciaSinSueldoRepository';

describe('createLicenciaSinSueldoRepository', () => {
  it('llama a createJsonModuleRepository con la tabla, key legacy y label correctos', () => {
    const repository = { loadSnapshot: vi.fn(), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    createLicenciaSinSueldoRepository(createJsonModuleRepository);

    expect(createJsonModuleRepository).toHaveBeenCalledTimes(1);
    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('licencia_sin_sueldo_records');
    expect(legacyKey).toBe('traccion.v1.licenciasSinSueldo.records');
    expect(moduleLabel).toBe('Licencia sin sueldo');
  });

  it('loadLicenciaSinSueldoRecordsSnapshot delega en repository.loadSnapshot', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(),
      saveManyIfUnchanged: vi.fn(),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const { loadLicenciaSinSueldoRecordsSnapshot } = createLicenciaSinSueldoRepository(
      createJsonModuleRepository,
    );
    const result = await loadLicenciaSinSueldoRecordsSnapshot();

    expect(repository.loadSnapshot).toHaveBeenCalledTimes(1);
    expect(result).toBe(snapshot);
  });

  it('saveLicenciaSinSueldoRecordIfUnchanged delega en repository.saveIfUnchanged con el mismo registro', async () => {
    const saveResult = {
      ok: true,
      status: { ready: true, engine: 'sqlite', phase: 'active' },
      currentUpdatedAt: '2026-01-01',
      message: 'ok',
    };
    const repository = {
      loadSnapshot: vi.fn(),
      saveIfUnchanged: vi.fn(async () => saveResult),
      saveManyIfUnchanged: vi.fn(),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const { saveLicenciaSinSueldoRecordIfUnchanged } = createLicenciaSinSueldoRepository(
      createJsonModuleRepository,
    );
    const record = { id: 'xyz', value: '{}', expectedUpdatedAt: '2025-12-31' };
    const result = await saveLicenciaSinSueldoRecordIfUnchanged(record);

    expect(repository.saveIfUnchanged).toHaveBeenCalledWith(record);
    expect(result).toBe(saveResult);
  });

  it('el flag de migración empieza en false', () => {
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

    createLicenciaSinSueldoRepository(createJsonModuleRepository);

    expect(capturedGetMigrationDone?.()).toBe(false);
  });
});
