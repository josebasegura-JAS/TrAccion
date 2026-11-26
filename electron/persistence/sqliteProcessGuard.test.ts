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
  it('conserva el camino histórico en producción y pruebas no aisladas', () => {
    vi.mocked(environment.getTraccionEnvironment).mockReturnValue('production');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '1');
    expect(assertSqliteProcessAccess).not.toThrow();
    vi.mocked(environment.getTraccionEnvironment).mockReturnValue('test');
    vi.stubEnv('TRACCION_SQLITE_ENGINE_EXPERIMENT', '0');
    expect(assertSqliteProcessAccess).not.toThrow();
  });
});
