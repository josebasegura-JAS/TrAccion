import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolHelpRecord } from '../domain/ayudaEscolar';

const mocks = vi.hoisted(() => ({
  publishDatabaseStatus: vi.fn(),
  writeRendererStorageCache: vi.fn(),
  saveNewSharedArrayRecord: vi.fn(),
}));

vi.mock('../../../services/databaseStatus', () => ({
  publishDatabaseStatus: mocks.publishDatabaseStatus,
}));

vi.mock('../../../services/persistence', () => ({
  writeRendererStorageCache: mocks.writeRendererStorageCache,
}));

vi.mock('../../../services/sharedRecordPersistence', () => ({
  saveNewSharedArrayRecord: mocks.saveNewSharedArrayRecord,
}));

import { AYUDA_ESCOLAR_STORAGE_KEY, useAyudaEscolarStore } from './useAyudaEscolarStore';

const activeStatus = {
  ready: true,
  phase: 'active',
  isDefaultPath: false,
  message: 'SQLite compartida activa.',
};

function record(id: string, archivedAt: string, overrides: Partial<SchoolHelpRecord> = {}): SchoolHelpRecord {
  return {
    id,
    employeeId: `employee-${id}`,
    employeeName: `Persona ${id}`,
    senderName: `Remitente ${id}`,
    senderEmail: `${id}@empresa.test`,
    subject: `Ayuda ${id}`,
    receivedAt: '2026-09-01T08:00:00.000Z',
    archivedAt,
    files: [
      {
        originalName: `${id}.pdf`,
        savedName: `${id}.pdf`,
        savedPath: `Z:/AyudaEscolar/2026/${id}.pdf`,
      },
    ],
    ...overrides,
  };
}

function setTraccion(value: unknown): void {
  Object.defineProperty(window, 'traccion', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('Ayuda Escolar - persistencia compartida', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAyudaEscolarStore.setState({ records: [] });
    setTraccion(undefined);
  });

  it('carga desde SQLite, descarta registros inválidos y ordena por archivado más reciente', async () => {
    const older = record('old', '2026-09-01T10:00:00.000Z');
    const newer = record('new', '2026-09-03T10:00:00.000Z', { sentOnBehalfOfAnother: true });
    const invalid = { ...record('bad', '2026-09-04T10:00:00.000Z'), files: [{ originalName: 'x.pdf' }] };
    const getPersistedRecord = vi.fn().mockResolvedValue({
      status: activeStatus,
      record: {
        key: AYUDA_ESCOLAR_STORAGE_KEY,
        value: JSON.stringify([older, invalid, newer]),
      },
    });
    setTraccion({ getPersistedRecord });

    await useAyudaEscolarStore.getState().load();

    expect(getPersistedRecord).toHaveBeenCalledWith(AYUDA_ESCOLAR_STORAGE_KEY);
    expect(mocks.publishDatabaseStatus).toHaveBeenCalledWith(activeStatus);
    expect(useAyudaEscolarStore.getState().records.map((item) => item.id)).toEqual(['new', 'old']);
    expect(mocks.writeRendererStorageCache).toHaveBeenCalledWith(
      AYUDA_ESCOLAR_STORAGE_KEY,
      JSON.stringify([newer, older]),
      'sqlite',
    );
  });

  it('si SQLite compartida no está disponible no usa datos locales como fallback', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const getPersistedRecord = vi.fn().mockResolvedValue({
      status: {
        ready: false,
        phase: 'error',
        isDefaultPath: false,
        message: 'Red no disponible.',
      },
      record: null,
    });
    setTraccion({ getPersistedRecord });
    useAyudaEscolarStore.setState({ records: [record('local', '2026-09-01T10:00:00.000Z')] });

    await useAyudaEscolarStore.getState().load();

    expect(useAyudaEscolarStore.getState().records).toEqual([]);
    expect(mocks.writeRendererStorageCache).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('reloadFromStorage no reescribe ni actualiza si el snapshot remoto es idéntico', async () => {
    const current = [record('same', '2026-09-02T10:00:00.000Z')];
    useAyudaEscolarStore.setState({ records: current });
    setTraccion({
      getPersistedRecord: vi.fn().mockResolvedValue({
        status: activeStatus,
        record: { key: AYUDA_ESCOLAR_STORAGE_KEY, value: JSON.stringify(current) },
      }),
    });

    await useAyudaEscolarStore.getState().reloadFromStorage();

    expect(useAyudaEscolarStore.getState().records).toEqual(current);
    expect(mocks.writeRendererStorageCache).not.toHaveBeenCalled();
  });

  it('reloadFromStorage aplica y espeja un snapshot remoto distinto', async () => {
    const current = [record('old', '2026-09-01T10:00:00.000Z')];
    const remote = [record('new', '2026-09-03T10:00:00.000Z'), ...current];
    useAyudaEscolarStore.setState({ records: current });
    setTraccion({
      getPersistedRecord: vi.fn().mockResolvedValue({
        status: activeStatus,
        record: { key: AYUDA_ESCOLAR_STORAGE_KEY, value: JSON.stringify(remote) },
      }),
    });

    await useAyudaEscolarStore.getState().reloadFromStorage();

    expect(useAyudaEscolarStore.getState().records.map((item) => item.id)).toEqual(['new', 'old']);
    expect(mocks.writeRendererStorageCache).toHaveBeenCalledWith(
      AYUDA_ESCOLAR_STORAGE_KEY,
      JSON.stringify(remote),
      'sqlite',
    );
  });

  it('add delega en la escritura atómica compartida, ordena el resultado y actualiza la caché', async () => {
    const older = record('old', '2026-09-01T10:00:00.000Z');
    const newer = record('new', '2026-09-05T10:00:00.000Z');
    mocks.saveNewSharedArrayRecord.mockResolvedValue({ records: [older, newer] });

    const result = await useAyudaEscolarStore.getState().add(newer);

    expect(result).toEqual({ ok: true, message: 'Seguimiento guardado en SQLite compartida.' });
    expect(mocks.saveNewSharedArrayRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        storageKey: AYUDA_ESCOLAR_STORAGE_KEY,
        newRecord: newer,
        duplicateMessage: 'Este registro de Ayuda Escolar ya existe en la base compartida.',
      }),
    );
    expect(useAyudaEscolarStore.getState().records.map((item) => item.id)).toEqual(['new', 'old']);
    expect(mocks.writeRendererStorageCache).toHaveBeenCalledWith(
      AYUDA_ESCOLAR_STORAGE_KEY,
      JSON.stringify([newer, older]),
      'sqlite',
    );
  });

  it('add devuelve el error de persistencia y no altera el estado si la escritura falla', async () => {
    const existing = record('existing', '2026-09-01T10:00:00.000Z');
    useAyudaEscolarStore.setState({ records: [existing] });
    mocks.saveNewSharedArrayRecord.mockRejectedValue(new Error('Este registro de Ayuda Escolar ya existe en la base compartida.'));

    const result = await useAyudaEscolarStore.getState().add(record('new', '2026-09-05T10:00:00.000Z'));

    expect(result).toEqual({
      ok: false,
      message: 'Este registro de Ayuda Escolar ya existe en la base compartida.',
    });
    expect(useAyudaEscolarStore.getState().records).toEqual([existing]);
    expect(mocks.writeRendererStorageCache).not.toHaveBeenCalled();
  });

  it('tolera JSON corrupto en SQLite tratándolo como una colección vacía', async () => {
    setTraccion({
      getPersistedRecord: vi.fn().mockResolvedValue({
        status: activeStatus,
        record: { key: AYUDA_ESCOLAR_STORAGE_KEY, value: '{json-corrupto' },
      }),
    });

    await useAyudaEscolarStore.getState().load();

    expect(useAyudaEscolarStore.getState().records).toEqual([]);
    expect(mocks.writeRendererStorageCache).toHaveBeenCalledWith(
      AYUDA_ESCOLAR_STORAGE_KEY,
      '[]',
      'sqlite',
    );
  });
});
