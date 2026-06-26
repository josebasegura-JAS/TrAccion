import { describe, expect, it, vi } from 'vitest';
import { createTeletrabajoGruposCoberturaRepository } from './teletrabajoGruposCoberturaRepository';

describe('createTeletrabajoGruposCoberturaRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'sqlite', phase: 'active' }, records: [] };
    const repository = { loadSnapshot: vi.fn(async () => snapshot), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn(() => repository);

    const api = createTeletrabajoGruposCoberturaRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('teletrabajo_grupo_cobertura_records');
    expect(legacyKey).toBe('traccion.v1.teletrabajo.gruposCobertura');
    expect(moduleLabel).toBe('Grupo de cobertura de teletrabajo');

    expect(await api.loadTeletrabajoGrupoCoberturaRecordsSnapshot()).toBe(snapshot);
  });
});
