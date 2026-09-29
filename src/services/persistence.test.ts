import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hydrateLocalStorageFromSqlite,
  isTemporarySqliteLockMessage,
} from './persistence';

describe('isTemporarySqliteLockMessage', () => {
  it('reconoce el mensaje de base ocupada temporalmente por otro equipo', () => {
    expect(
      isTemporarySqliteLockMessage(
        'Base ocupada temporalmente por acabrera@PO153 (PID 7160). Inténtalo de nuevo en unos segundos.',
      ),
    ).toBe(true);
  });

  it('reconoce el mensaje de bloqueo temporal de operación SQLite', () => {
    expect(
      isTemporarySqliteLockMessage('Bloqueo temporal de operación SQLite, reintentando...'),
    ).toBe(true);
  });

  it('no marca como bloqueo otros errores de guardado, como un conflicto de concurrencia', () => {
    expect(isTemporarySqliteLockMessage('El registro ha sido modificado por otro usuario.')).toBe(
      false,
    );
  });

  it('no es sensible a mayúsculas/minúsculas', () => {
    expect(isTemporarySqliteLockMessage('BASE OCUPADA TEMPORALMENTE por X')).toBe(true);
  });
});

describe('hydrateLocalStorageFromSqlite — errores inesperados', () => {
  afterEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('incluye el mensaje real del error en el motivo, no solo un texto genérico', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadPersistedRecords: vi.fn(async () => {
          throw new Error("EPERM: operation not permitted, open 'Z:\\datos\\traccion.sqlite'");
        }),
      },
    });

    const result = await hydrateLocalStorageFromSqlite();

    expect(result.status).toBe('sqlite-unavailable');
    expect(result.reason).toContain('EPERM');
    expect(result.reason).toContain('traccion.sqlite');
  });

  it('cae en un texto genérico si el valor lanzado no es un Error con mensaje', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadPersistedRecords: vi.fn(async () => {
          throw 'fallo sin forma de Error';
        }),
      },
    });

    const result = await hydrateLocalStorageFromSqlite();

    expect(result.status).toBe('sqlite-unavailable');
    expect(result.reason).toContain('Error leyendo SQLite');
  });
});
