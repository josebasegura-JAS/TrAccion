import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSessionRecordInSqlite,
  hasSessionSqliteRepository,
  loadAllSessionRecordsFromSqlite,
  saveSessionRecordToSqlite,
} from './sessionSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

function record(overrides: Partial<{
  id: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}> = {}) {
  return {
    id: 'session-1',
    value: JSON.stringify({ id: 'session-1', title: 'Sesión' }),
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

describe('sessionSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  describe('hasSessionSqliteRepository', () => {
    it('devuelve false sin bindings de comité', () => {
      expect(hasSessionSqliteRepository('comite')).toBe(false);
    });

    it('devuelve true cuando comité tiene load y save', () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(),
          saveComiteSessionRecordIfUnchanged: vi.fn(),
        },
      });

      expect(hasSessionSqliteRepository('comite')).toBe(true);
      expect(hasSessionSqliteRepository('paritaria')).toBe(false);
    });

    it('devuelve true cuando paritaria tiene load y save', () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadParitariaSessionRecords: vi.fn(),
          saveParitariaSessionRecordIfUnchanged: vi.fn(),
        },
      });

      expect(hasSessionSqliteRepository('paritaria')).toBe(true);
      expect(hasSessionSqliteRepository('comite')).toBe(false);
    });

    it('devuelve false si solo existe el loader pero no el saver', () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: { loadComiteSessionRecords: vi.fn() },
      });

      expect(hasSessionSqliteRepository('comite')).toBe(false);
    });
  });

  describe('loadAllSessionRecordsFromSqlite', () => {
    it('devuelve null si el módulo no tiene bindings', async () => {
      await expect(loadAllSessionRecordsFromSqlite('comite')).resolves.toBeNull();
    });

    it('devuelve null si SQLite no está activo', async () => {
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(async () => ({
            status: { ready: false, phase: 'initializing', message: 'Inicializando' },
            records: [],
          })),
          saveComiteSessionRecordIfUnchanged: vi.fn(),
        },
      });

      await expect(loadAllSessionRecordsFromSqlite('comite')).resolves.toBeNull();
    });

    it('devuelve los registros cuando SQLite está activo (comité)', async () => {
      const sessionRecord = record({ id: 'comite-1' });
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(async () => ({
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            records: [sessionRecord],
          })),
          saveComiteSessionRecordIfUnchanged: vi.fn(),
        },
      });

      await expect(loadAllSessionRecordsFromSqlite('comite')).resolves.toEqual([sessionRecord]);
    });

    it('devuelve los registros cuando SQLite está activo (paritaria)', async () => {
      const sessionRecord = record({ id: 'paritaria-1' });
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadParitariaSessionRecords: vi.fn(async () => ({
            status: { ready: true, phase: 'active', message: 'SQLite activo' },
            records: [sessionRecord],
          })),
          saveParitariaSessionRecordIfUnchanged: vi.fn(),
        },
      });

      await expect(loadAllSessionRecordsFromSqlite('paritaria')).resolves.toEqual([sessionRecord]);
    });
  });

  describe('saveSessionRecordToSqlite', () => {
    it('lanza si el módulo no tiene bindings', async () => {
      await expect(saveSessionRecordToSqlite('comite', 'storage-key', 'session-1', '{}', null)).rejects.toThrow(
        'SQLite compartido no disponible',
      );
    });

    it('guarda correctamente y devuelve el resultado normalizado', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        currentUpdatedAt: timestamp,
        message: 'Sesión de comité guardada en SQLite.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(),
          saveComiteSessionRecordIfUnchanged: saver,
        },
      });

      const result = await saveSessionRecordToSqlite('comite', 'traccion.v1.comite.sessions', 'session-1', '{"id":"session-1"}', 'previous-token');

      expect(saver).toHaveBeenCalledWith({
        id: 'session-1',
        value: '{"id":"session-1"}',
        expectedUpdatedAt: 'previous-token',
      });
      expect(result).toEqual({
        ok: true,
        message: 'Sesión de comité guardada en SQLite.',
        currentUpdatedAt: timestamp,
      });
    });

    it('lanza con el mensaje del conflicto cuando ok es false', async () => {
      const saver = vi.fn(async () => ({
        ok: false,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        currentUpdatedAt: '2026-06-18T00:00:00.000Z',
        message: 'La sesión ha sido modificada por otro usuario. Cierra y vuelve a abrir antes de guardar.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(),
          saveComiteSessionRecordIfUnchanged: saver,
        },
      });

      await expect(
        saveSessionRecordToSqlite('comite', 'traccion.v1.comite.sessions', 'session-1', '{}', 'stale-token'),
      ).rejects.toThrow('La sesión ha sido modificada por otro usuario');
    });
  });

  describe('deleteSessionRecordInSqlite', () => {
    it('marca deletedAt en el value_json y reutiliza saveSessionRecordToSqlite', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        currentUpdatedAt: '2026-06-19T00:00:00.000Z',
        message: 'Sesión de comité guardada en SQLite.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(),
          saveComiteSessionRecordIfUnchanged: saver,
        },
      });

      const currentValue = JSON.stringify({ id: 'session-1', title: 'Sesión activa' });
      const result = await deleteSessionRecordInSqlite(
        'comite',
        'traccion.v1.comite.sessions',
        'session-1',
        currentValue,
        timestamp,
      );

      expect(saver).toHaveBeenCalledTimes(1);
      const callArg = saver.mock.calls[0][0] as { id: string; value: string; expectedUpdatedAt: string | null };
      expect(callArg.id).toBe('session-1');
      expect(callArg.expectedUpdatedAt).toBe(timestamp);

      const sentValue = JSON.parse(callArg.value) as { id: string; title: string; deletedAt: string; updatedAt: string };
      expect(sentValue.title).toBe('Sesión activa');
      expect(sentValue.deletedAt).toBeTruthy();
      expect(sentValue.updatedAt).toBe(sentValue.deletedAt);
      expect(result).toEqual({
        ok: true,
        message: 'Sesión de comité guardada en SQLite.',
        currentUpdatedAt: '2026-06-19T00:00:00.000Z',
      });
    });

    it('si el value actual no es JSON válido, guarda solo deletedAt/updatedAt', async () => {
      const saver = vi.fn(async () => ({
        ok: true,
        status: { ready: true, phase: 'active', message: 'SQLite activo' },
        currentUpdatedAt: '2026-06-19T00:00:00.000Z',
        message: 'Sesión de comité guardada en SQLite.',
      }));
      Object.defineProperty(window, 'traccion', {
        configurable: true,
        value: {
          loadComiteSessionRecords: vi.fn(),
          saveComiteSessionRecordIfUnchanged: saver,
        },
      });

      await deleteSessionRecordInSqlite('comite', 'traccion.v1.comite.sessions', 'session-1', 'no-es-json', null);

      const callArg = saver.mock.calls[0][0] as { value: string };
      const sentValue = JSON.parse(callArg.value) as { deletedAt: string; updatedAt: string };
      expect(sentValue.deletedAt).toBeTruthy();
      expect(sentValue.updatedAt).toBe(sentValue.deletedAt);
    });
  });
});
