import { describe, expect, it } from 'vitest';
import { shouldUseIsolatedSqliteHealth } from './sqliteHealthIsolationPolicy.js';

describe('Health-check SQLite aislado por defecto', () => {
  it('aísla las consultas nativas si no existe configuración explícita', () => {
    expect(shouldUseIsolatedSqliteHealth(undefined)).toBe(true);
    expect(shouldUseIsolatedSqliteHealth('')).toBe(true);
    expect(shouldUseIsolatedSqliteHealth('1')).toBe(true);
  });

  it('solo permite diagnóstico legado mediante opt-out explícito', () => {
    expect(shouldUseIsolatedSqliteHealth('0')).toBe(false);
    expect(shouldUseIsolatedSqliteHealth('false')).toBe(true);
  });
});
