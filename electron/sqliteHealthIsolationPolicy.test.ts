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


describe('PR510: contención de timeouts aislados SOLO en pruebas', () => {
  it('usa la conexión ya abierta para el health-check rutinario de Pruebas', () => {
    expect(shouldUseIsolatedSqliteHealth(undefined, 'test')).toBe(false);
    expect(shouldUseIsolatedSqliteHealth('', 'test')).toBe(false);
  });

  it('mantiene el proceso auxiliar aislado en Producción', () => {
    expect(shouldUseIsolatedSqliteHealth(undefined, 'production')).toBe(true);
    expect(shouldUseIsolatedSqliteHealth('false', 'production')).toBe(true);
  });

  it('permite activar explícitamente el worker para diagnosticar Pruebas', () => {
    expect(shouldUseIsolatedSqliteHealth('1', 'test')).toBe(true);
    expect(shouldUseIsolatedSqliteHealth('0', 'test')).toBe(false);
  });
});
