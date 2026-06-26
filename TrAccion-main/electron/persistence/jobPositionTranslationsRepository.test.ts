import { describe, expect, it, vi } from 'vitest';
import { createJobPositionTranslationsRepository } from './jobPositionTranslationsRepository';

describe('createJobPositionTranslationsRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const repository = { loadSnapshot: vi.fn(async () => snapshot), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createJobPositionTranslationsRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('job_position_translation_records');
    expect(legacyKey).toBe('traccion.v1.plantilla.jobPositionTranslations');
    expect(moduleLabel).toBe('Traducción de puesto');

    expect(await api.loadJobPositionTranslationRecordsSnapshot()).toBe(snapshot);
  });
});
