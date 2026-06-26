import { describe, expect, it, vi } from 'vitest';
import { createActaTypesRepository } from './actaTypesRepository';

describe('createActaTypesRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las 3 funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const batchResult = { ok: true, status: { ready: true, engine: 'sqlite', phase: 'active' }, results: [], message: 'ok' };
    const repository = {
      loadSnapshot: vi.fn(async () => snapshot),
      saveIfUnchanged: vi.fn(),
      saveManyIfUnchanged: vi.fn(async () => batchResult),
    };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createActaTypesRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('acta_type_records');
    expect(legacyKey).toBe('traccion.v1.actas.types');
    expect(moduleLabel).toBe('Tipo de acta');

    expect(await api.loadActaTypeRecordsSnapshot()).toBe(snapshot);
    expect(await api.saveActaTypeRecordsIfUnchanged([])).toBe(batchResult);
  });
});
