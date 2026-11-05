import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLotteryCampaign } from '../domain/loteria';
import { useLoteriaStore } from './useLoteriaStore';

describe('Lotería: no ignorar registros de SQLite ilegibles', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useLoteriaStore.setState({ campaign: createDefaultLotteryCampaign(2026), campaignUpdatedAt: 'v1', requestUpdatedAt: {} });
  });
  it('conserva campaña y tokens anteriores ante solicitud corrupta', async () => {
    const campaign = createDefaultLotteryCampaign(new Date().getFullYear());
    const previous = useLoteriaStore.getState().campaign;
    const loader = vi.fn(async () => ({
      status: { ready: true, phase: 'active' },
      campaigns: [{ id: String(campaign.year), value: JSON.stringify(campaign), updatedAt: 'v2' }],
      requests: [{ id: 'erronea', campaignYear: campaign.year, value: '{corrupto', updatedAt: 'v2' }],
    }));
    Object.defineProperty(window, 'traccion', { configurable: true, value: { loadLoteriaRecords: loader } });
    await expect(useLoteriaStore.getState().reloadFromStorage()).rejects.toThrow(
      /Lotería: la solicitud erronea no se puede leer/,
    );
    expect(loader).toHaveBeenCalledOnce();
    expect(useLoteriaStore.getState().campaign).toBe(previous);
    expect(useLoteriaStore.getState().campaignUpdatedAt).toBe('v1');
  });
});
