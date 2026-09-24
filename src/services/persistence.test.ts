import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLITE_PENDING_WRITES_KEY } from './persistenceKeys';
import {
  flushPendingSqliteWrites,
  hydrateLocalStorageFromSqlite,
  isTemporarySqliteLockMessage,
} from './persistence';

// Clave de negocio real usada para comprobar la purga de colas heredadas.
const TEST_KEY = 'traccion.v1.vinculograma.records';

function writePendingWriteDirectly(attempts: number): void {
  window.localStorage.setItem(
    SQLITE_PENDING_WRITES_KEY,
    JSON.stringify([
      {
        key: TEST_KEY,
        value: '[]',
        updatedAt: new Date().toISOString(),
        expectedUpdatedAt: null,
        attempts,
        lastError: 'Conflicto de concurrencia simulado.',
      },
    ]),
  );
}

function readPendingWriteCount(): number {
  const stored = window.localStorage.getItem(SQLITE_PENDING_WRITES_KEY);
  if (!stored) {
    return 0;
  }
  const parsed: unknown = JSON.parse(stored);
  return Array.isArray(parsed) ? parsed.length : 0;
}

describe('persistence — colas offline deshabilitadas', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    window.localStorage.clear();
  });

  it('purga una cola heredada sin reproducirla contra SQLite', async () => {
    writePendingWriteDirectly(1);
    const save = vi.fn();
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveLocalStorageRecordIfUnchanged: save },
    });

    const flushed = await flushPendingSqliteWrites();

    expect(flushed).toBe(0);
    expect(readPendingWriteCount()).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('purga todas las claves de una cola heredada', async () => {
    window.localStorage.setItem(
      SQLITE_PENDING_WRITES_KEY,
      JSON.stringify([
        { key: TEST_KEY, value: '[]', updatedAt: new Date().toISOString(), expectedUpdatedAt: null, attempts: 1, lastError: 'offline' },
        { key: 'traccion.v1.criterios-rrll.criterios', value: '[]', updatedAt: new Date().toISOString(), expectedUpdatedAt: null, attempts: 2, lastError: 'offline' },
      ]),
    );

    await flushPendingSqliteWrites();
    expect(window.localStorage.getItem(SQLITE_PENDING_WRITES_KEY)).toBeNull();
  });
});

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
