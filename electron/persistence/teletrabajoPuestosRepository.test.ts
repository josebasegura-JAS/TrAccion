import { describe, expect, it, vi } from 'vitest';
import { createTeletrabajoPuestosRepository } from './teletrabajoPuestosRepository';

describe('createTeletrabajoPuestosRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' }, records: [] };
    const repository = { loadSnapshot: vi.fn(async () => snapshot), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn<(tableName: string, legacyKey: string, moduleLabel: string, getMigrationDone: () => boolean, setMigrationDone: (value: boolean) => void) => typeof repository>(() => repository);

    const api = createTeletrabajoPuestosRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('teletrabajo_puesto_records');
    expect(legacyKey).toBe('traccion.v1.teletrabajo.puestos');
    expect(moduleLabel).toBe('Puesto teletrabajable');

    expect(await api.loadTeletrabajoPuestoRecordsSnapshot()).toBe(snapshot);
  });
});
