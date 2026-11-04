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
    await expect(useActasStore.getState().reloadFromStorage())
      .rejects.toThrow('temporalmente inaccesible');
    expect(loader).toHaveBeenCalledOnce();
    expect(useActasStore.getState().actas).toEqual([previous]);
  });

  it('propaga un rechazo IPC y permite reintentar la lectura sin perder datos previos', async () => {
    const previous = {
      ...EMPTY_ACTA_DRAFT,
      id: 'acta-previa',
      titulo: 'Acta anterior',
      updatedAt: '2026-11-02T09:00:00.000Z',
    } as Acta;
    const newActa = { ...previous, titulo: 'Acta actualizada', updatedAt: '2026-11-04T10:00:00.000Z' };
    useActasStore.setState({ actas: [previous] });
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('SMB temporalmente inaccesible'))
      .mockResolvedValueOnce({
        status: { ready: true, phase: 'active' },
        records: [{ id: newActa.id, value: JSON.stringify(newActa), updatedAt: newActa.updatedAt }],
      });
    Object.defineProperty(window, 'traccion', { configurable: true, value: {
      loadActaRecords: loader,
      saveActaRecordIfUnchanged: vi.fn(),
    } });

    await expect(useActasStore.getState().reloadFromStorage())
      .rejects.toThrow('SMB temporalmente inaccesible');
    expect(useActasStore.getState().actas).toEqual([previous]);

    await expect(useActasStore.getState().reloadFromStorage()).resolves.toBeUndefined();
    expect(loader).toHaveBeenCalledTimes(2);
    // La carga desde SQLite normaliza campos opcionales y añade metadatos
    // ausentes en el fixture. Verificar el contenido recuperado, no la
    // igualdad exacta de un objeto de prueba incompleto.
    expect(useActasStore.getState().actas).toHaveLength(1);
    expect(useActasStore.getState().actas[0]).toMatchObject({
      id: newActa.id,
      titulo: newActa.titulo,
      updatedAt: newActa.updatedAt,
    });
  });

});
