import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Acta } from '../domain/acta';
import {
  deleteActaInSqlite,
  hasActaSqliteRepository,
  loadActaRecordsFromSqlite,
  loadActasFromSqlite,
  saveActaToSqlite,
} from './actaSqliteRepository';

const timestamp = '2026-06-17T08:00:00.000Z';

function acta(overrides: Partial<Acta> = {}): Acta {
  return {
    id: 'acta-1',
    titulo: 'Acta SQLite',
    tipo: 'ordinaria',
    fechaSesion: '2026-06-10',
    fechaCreacion: timestamp,
    estado: 'Pendiente de redactar',
    fechaLimite: '2026-06-20',
    observaciones: '',
    alegaciones: [],
    actualizaciones: [],
    actaPath: '',
    closedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    sourceSessionId: null,
    ...overrides,
  };
}

function parseActasArray(storageValue: string | null): Acta[] {
  return storageValue ? (JSON.parse(storageValue) as Acta[]) : [];
}

describe('actaSqliteRepository', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 0),
    });
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
  });

  it('detecta si el repositorio SQLite de actas está disponible', () => {
    expect(hasActaSqliteRepository()).toBe(false);

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadActaRecords: vi.fn(), saveActaRecordIfUnchanged: vi.fn() },
    });

    expect(hasActaSqliteRepository()).toBe(true);
  });

  it('devuelve null si SQLite no está activo para lectura (loadActasFromSqlite)', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadActasFromSqlite(parseActasArray)).resolves.toBeNull();
  });

  it('carga actas desde snapshot SQLite activo envolviendo cada registro como array', async () => {
    const storedActa = acta({ id: 'acta-2', titulo: 'Persistida' });
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [
            {
              id: storedActa.id,
              value: JSON.stringify(storedActa),
              createdAt: timestamp,
              updatedAt: timestamp,
              deletedAt: null,
            },
          ],
        })),
      },
    });

    await expect(loadActasFromSqlite(parseActasArray)).resolves.toEqual([storedActa]);
  });

  it('loadActaRecordsFromSqlite devuelve los registros crudos sin parsear', async () => {
    const rawRecord = {
      id: 'acta-3',
      value: JSON.stringify(acta({ id: 'acta-3' })),
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    };
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaRecords: vi.fn(async () => ({
          status: { ready: true, phase: 'active', message: 'SQLite activo' },
          records: [rawRecord],
        })),
      },
    });

    await expect(loadActaRecordsFromSqlite()).resolves.toEqual([rawRecord]);
  });

  it('loadActaRecordsFromSqlite devuelve null si SQLite no está activo', async () => {
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        loadActaRecords: vi.fn(async () => ({
          status: { ready: false, phase: 'initializing', message: 'Inicializando' },
          records: [],
        })),
      },
    });

    await expect(loadActaRecordsFromSqlite()).resolves.toBeNull();
  });

  it('guarda acta con expectedUpdatedAt y devuelve el resultado normalizado', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Acta guardada.',
      currentUpdatedAt: timestamp,
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaRecordIfUnchanged: saver },
    });

    const draftActa = acta();
    const result = await saveActaToSqlite(draftActa, 'previous-token');

    expect(saver).toHaveBeenCalledWith({
      id: 'acta-1',
      value: JSON.stringify(draftActa),
      expectedUpdatedAt: 'previous-token',
    });
    expect(result).toEqual({ ok: true, message: 'Acta guardada.', currentUpdatedAt: timestamp });
  });

  it('devuelve null si no existe saver SQLite para escritura', async () => {
    await expect(saveActaToSqlite(acta(), null)).resolves.toBeNull();
  });

  it('propaga el conflicto de concurrencia sin lanzar excepción', async () => {
    const saver = vi.fn(async () => ({
      ok: false,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'El acta ha sido modificada por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaRecordIfUnchanged: saver },
    });

    const result = await saveActaToSqlite(acta(), 'stale-token');

    expect(result).toEqual({
      ok: false,
      message: 'El acta ha sido modificada por otro usuario.',
      currentUpdatedAt: '2026-06-18T00:00:00.000Z',
    });
  });

  it('deleteActaInSqlite marca deletedAt y reutiliza saveActaToSqlite', async () => {
    const saver = vi.fn(async () => ({
      ok: true,
      status: { ready: true, phase: 'active', message: 'SQLite activo' },
      message: 'Acta eliminada.',
      currentUpdatedAt: '2026-06-19T00:00:00.000Z',
    }));
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { saveActaRecordIfUnchanged: saver },
    });

    const original = acta({ id: 'acta-4' });
    const result = await deleteActaInSqlite(original, timestamp);

    expect(saver).toHaveBeenCalledTimes(1);
    const callArg = saver.mock.calls[0][0] as { id: string; value: string; expectedUpdatedAt: string | null };
    expect(callArg.id).toBe('acta-4');
    expect(callArg.expectedUpdatedAt).toBe(timestamp);

    const sentActa = JSON.parse(callArg.value) as Acta & { deletedAt: string };
    expect(sentActa.deletedAt).toBeTruthy();
    expect(sentActa.updatedAt).toBe(sentActa.deletedAt);
    expect(result).toEqual({ ok: true, message: 'Acta eliminada.', currentUpdatedAt: '2026-06-19T00:00:00.000Z' });
  });
});
