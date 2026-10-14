import { describe, expect, it, vi } from 'vitest';
import { createEspecialesRecipientRepository } from './especialesRecipientRepository';

describe('createEspecialesRecipientRepository', () => {
  it('configura la tabla, key legacy y label correctos, y expone las funciones con el nombre esperado', async () => {
    const snapshot = { status: { ready: true, engine: 'better-sqlite3' as const, phase: 'active' as const, path: '/x.sqlite', schemaVersion: 17, isDefaultPath: false, lockPath: '/x.lockdir' }, records: [] };
    const repository = { loadSnapshot: vi.fn(async () => snapshot), saveIfUnchanged: vi.fn(), saveManyIfUnchanged: vi.fn() };
    const createJsonModuleRepository = vi.fn<(tableName: string, legacyKey: string, moduleLabel: string, getMigrationDone: () => boolean, setMigrationDone: (value: boolean) => void) => typeof repository>(() => repository);

    const api = createEspecialesRecipientRepository(createJsonModuleRepository);

    const [tableName, legacyKey, moduleLabel] = createJsonModuleRepository.mock.calls[0];
    expect(tableName).toBe('especiales_recipient_records');
    expect(legacyKey).toBe('rrll_especiales_destinatarios');
    expect(moduleLabel).toBe('Destinatario especial');

    expect(await api.loadEspecialesRecipientRecordsSnapshot()).toBe(snapshot);
  });
});
