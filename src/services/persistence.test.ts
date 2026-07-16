import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQLITE_PENDING_WRITES_KEY } from './persistenceKeys';
import {
  flushPendingSqliteWrites,
  hydrateLocalStorageFromSqlite,
  isTemporarySqliteLockMessage,
  subscribeToPersistenceFeedback,
  type PersistenceFeedback,
} from './persistence';

// Clave de negocio real (PERSISTED_STORAGE_KEYS) usada como ejemplo en los
// tests: cualquier escritura pendiente con una clave fuera de esa lista se
// descarta sin más por upsertPendingSqliteWrite, así que hace falta una
// clave válida para ejercitar el camino real de reintento/descarte.
const TEST_KEY = 'traccion.v1.vinculograma.records';
const MAX_PENDING_WRITE_ATTEMPTS = 20;

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

describe('persistence — cola de writes pendientes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) =>
        window.setTimeout(() => callback(performance.now()), 0),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    window.localStorage.clear();
  });

  it('mantiene el write en la cola y reintenta mientras no se supere el límite de intentos', async () => {
    writePendingWriteDirectly(MAX_PENDING_WRITE_ATTEMPTS - 1);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        saveLocalStorageRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: null,
          message: 'El registro ha sido modificado por otro usuario.',
        })),
      },
    });

    await flushPendingSqliteWrites();

    // attempts pasa de 19 a 20: todavía dentro del límite, debe seguir en la cola.
    expect(readPendingWriteCount()).toBe(1);
  });

  it('descarta el write y emite un aviso visible al usuario al superar el límite de intentos', async () => {
    writePendingWriteDirectly(MAX_PENDING_WRITE_ATTEMPTS);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        saveLocalStorageRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: null,
          message: 'El registro ha sido modificado por otro usuario.',
        })),
      },
    });

    const receivedFeedback: PersistenceFeedback[] = [];
    const unsubscribe = subscribeToPersistenceFeedback((feedback) => {
      receivedFeedback.push(feedback);
    });

    await flushPendingSqliteWrites();
    unsubscribe();

    // attempts pasa de 20 a 21: supera el límite, debe descartarse de la cola.
    expect(readPendingWriteCount()).toBe(0);

    const discardFeedback = receivedFeedback.find((feedback) =>
      feedback.message.includes('se ha descartado'),
    );
    expect(discardFeedback).toBeDefined();
    expect(discardFeedback?.kind).toBe('error');
    expect(discardFeedback?.key).toBe(TEST_KEY);
  });

  it('no afecta a otras claves pendientes cuando una se descarta', async () => {
    const otherKey = 'traccion.v1.criterios-rrll.criterios';
    window.localStorage.setItem(
      SQLITE_PENDING_WRITES_KEY,
      JSON.stringify([
        {
          key: TEST_KEY,
          value: '[]',
          updatedAt: new Date().toISOString(),
          expectedUpdatedAt: null,
          attempts: MAX_PENDING_WRITE_ATTEMPTS,
          lastError: 'Conflicto de concurrencia simulado.',
        },
        {
          key: otherKey,
          value: '[]',
          updatedAt: new Date().toISOString(),
          expectedUpdatedAt: null,
          attempts: 1,
          lastError: 'Error de red simulado.',
        },
      ]),
    );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        saveLocalStorageRecordIfUnchanged: vi.fn(async () => ({
          ok: false,
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          currentUpdatedAt: null,
          message: 'El registro ha sido modificado por otro usuario.',
        })),
      },
    });

    await flushPendingSqliteWrites();

    const stored = window.localStorage.getItem(SQLITE_PENDING_WRITES_KEY);
    const remaining = stored ? (JSON.parse(stored) as Array<{ key: string }>) : [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe(otherKey);
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
