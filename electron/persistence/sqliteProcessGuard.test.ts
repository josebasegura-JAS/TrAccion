import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSqliteProcessAccess } from './sqliteProcessGuard.js';
import * as environment from './traccionEnvironment.js';

vi.mock('./traccionEnvironment.js', () => ({ getTraccionEnvironment: vi.fn(() => 'test') }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe('Exclusividad del propietario SQLite', () => {
  it('rechaza acceso directo desde main experimental', () => {
    vi.mocked(environment.getTraccionEnvironment).mockReturnValue('test');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '1');
    expect(assertSqliteProcessAccess).toThrow('Acceso SQLite directo prohibido');
  });
  it('protege también producción aislada y conserva el modo histórico sin activación', () => {
    vi.mocked(environment.getTraccionEnvironment).mockReturnValue('production');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '1');
    expect(assertSqliteProcessAccess).toThrow('Acceso SQLite directo prohibido');
    vi.mocked(environment.getTraccionEnvironment).mockReturnValue('test');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '0');
    expect(assertSqliteProcessAccess).not.toThrow();
  });
});
