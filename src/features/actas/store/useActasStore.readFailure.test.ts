import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_ACTA_DRAFT, type Acta } from '../domain/acta';
import { useActasStore } from './useActasStore';

describe('Actas: fallo SQLite no equivale a lista vacía', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useActasStore.setState({ actas: [], hasLoadedHistoricalActas: false });
  });
  it('conserva actas al desconectarse el repositorio en una recarga', async () => {
    const previous = {
      ...EMPTY_ACTA_DRAFT,
      id: 'acta-previa',
      titulo: 'Acta anterior',
      updatedAt: '2026-11-02T09:00:00.000Z',
    } as Acta;
    useActasStore.setState({ actas: [previous] });
    const loader = vi.fn(async () => ({
      status: { ready: false, phase: 'reconnecting' }, records: [],
    }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadActaRecords: loader,
      saveActaRecordIfUnchanged: vi.fn(),
    } });
    useActasStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useActasStore.getState().actas).toEqual([previous]);
  });
});
