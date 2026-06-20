import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EspecialRecipient } from '../domain/especiales';
import { useEspecialesStore } from './useEspecialesStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function recipient(overrides: Partial<EspecialRecipient> = {}): EspecialRecipient {
  return {
    id: 'recipient-1',
    name: 'Ana García',
    email: 'ana.garcia@example.com',
    type: 'to',
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...overrides,
  };
}

function activeStatus() {
  return { ready: true, phase: 'active' as const, message: 'SQLite activo' };
}

function recordsSnapshot(recipients: EspecialRecipient[], updatedAt: string) {
  return {
    status: activeStatus(),
    records: recipients.map((item) => ({
      id: item.id,
      value: JSON.stringify(item),
      createdAt: timestamp,
      updatedAt,
      deletedAt: null,
    })),
  };
}

describe('useEspecialesStore concurrencia multiusuario', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useEspecialesStore.setState({ recipients: [] });
  });

  it('rechaza el guardado cuando otro usuario ha modificado el destinatario entre tanto (expectedUpdatedAt obsoleto)', async () => {
    const existingRecipient = recipient();
    const loader = vi.fn(async () => recordsSnapshot([existingRecipient], timestamp));
    // El saver simula que otro usuario ha modificado este destinatario justo
    // antes: el expectedUpdatedAt que envía este cliente ya no coincide con
    // el valor vigente en SQLite, así que la operación debe fallar.
    const saver = vi.fn(async () => ({
      ok: false,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:05:00.000Z',
      message: 'Este destinatario ha sido modificado por otro usuario. Cierra y vuelve a abrir el detalle para no sobrescribir cambios.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEspecialesRecipientRecords: loader, saveEspecialesRecipientRecordIfUnchanged: saver },
    });

    useEspecialesStore.getState().load();
    await vi.waitFor(() => expect(useEspecialesStore.getState().recipients).toHaveLength(1));

    const result = await useEspecialesStore.getState().updateRecipientWithConcurrencyCheck(
      existingRecipient.id,
      { name: 'Ana García (editado)', email: existingRecipient.email, type: existingRecipient.type },
      // Pasamos deliberadamente un expectedUpdatedAt obsoleto, distinto del
      // que devuelve el loader, para simular el cambio de otro usuario.
      '2026-06-17T07:00:00.000Z',
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/modificado por otro usuario/i);
    expect(saver).toHaveBeenCalledTimes(1);
    // El nombre local NO debe haberse actualizado: el conflicto impide
    // sobrescribir lo que hay en la base compartida.
    expect(useEspecialesStore.getState().recipients[0].name).toBe('Ana García');
  });

  it('permite el guardado cuando expectedUpdatedAt coincide con el valor vigente en SQLite', async () => {
    const existingRecipient = recipient();
    const loader = vi.fn(async () => recordsSnapshot([existingRecipient], timestamp));
    const saver = vi.fn(async () => ({
      ok: true,
      status: activeStatus(),
      currentUpdatedAt: '2026-06-17T08:10:00.000Z',
      message: 'Destinatario guardado.',
    }));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEspecialesRecipientRecords: loader, saveEspecialesRecipientRecordIfUnchanged: saver },
    });

    useEspecialesStore.getState().load();
    await vi.waitFor(() => expect(useEspecialesStore.getState().recipients).toHaveLength(1));

    const result = await useEspecialesStore.getState().updateRecipientWithConcurrencyCheck(
      existingRecipient.id,
      { name: 'Ana García (editado)', email: existingRecipient.email, type: existingRecipient.type },
      timestamp,
    );

    expect(result.ok).toBe(true);
    expect(saver).toHaveBeenCalledTimes(1);
    expect(useEspecialesStore.getState().recipients[0].name).toBe('Ana García (editado)');
  });

  it('reloadFromStorage no sustituye el estado si el contenido normalizado no ha cambiado', async () => {
    const existingRecipient = recipient();
    const loader = vi.fn(async () => recordsSnapshot([existingRecipient], timestamp));

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEspecialesRecipientRecords: loader, saveEspecialesRecipientRecordIfUnchanged: vi.fn() },
    });

    useEspecialesStore.getState().load();
    await vi.waitFor(() => expect(useEspecialesStore.getState().recipients).toHaveLength(1));

    const recipientsBeforeReload = useEspecialesStore.getState().recipients;

    // El polling detecta un cambio (por ejemplo, generado por nuestra propia
    // escritura en otra pestaña), pero el contenido normalizado que devuelve
    // SQLite es idéntico al que ya tenemos (sqliteUpdatedAt aparte).
    useEspecialesStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(2));

    // La referencia de array debe mantenerse intacta: reloadFromStorage no
    // debe haber llamado a set() si el contenido no cambió realmente.
    expect(useEspecialesStore.getState().recipients).toBe(recipientsBeforeReload);
  });

  it('reloadFromStorage sí actualiza el estado cuando otro usuario añade un destinatario nuevo', async () => {
    const existingRecipient = recipient();
    const loader = vi
      .fn()
      .mockResolvedValueOnce(recordsSnapshot([existingRecipient], timestamp))
      .mockResolvedValueOnce(
        recordsSnapshot(
          [existingRecipient, recipient({ id: 'recipient-2', name: 'Bea Ruiz', email: 'bea.ruiz@example.com' })],
          '2026-06-17T09:00:00.000Z',
        ),
      );

    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: { loadEspecialesRecipientRecords: loader, saveEspecialesRecipientRecordIfUnchanged: vi.fn() },
    });

    useEspecialesStore.getState().load();
    await vi.waitFor(() => expect(useEspecialesStore.getState().recipients).toHaveLength(1));

    useEspecialesStore.getState().reloadFromStorage();
    await vi.waitFor(() => expect(useEspecialesStore.getState().recipients).toHaveLength(2));

    expect(useEspecialesStore.getState().recipients.map((item) => item.id).sort()).toEqual([
      'recipient-1',
      'recipient-2',
    ]);
  });
});
