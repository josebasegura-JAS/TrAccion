import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultLotteryCampaign } from '../domain/loteria';
import { useLoteriaStore } from './useLoteriaStore';

const status = { ready: true, phase: 'active' as const, engine: 'better-sqlite3' as const };
describe('Lotería: conflictos de escritura concurrente', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useLoteriaStore.setState({ campaign: createDefaultLotteryCampaign(2026), campaignUpdatedAt: 'v1', requestUpdatedAt: {} });
  });
  it('rechaza un arqueo obsoleto sin sobrescribir el cierre de otro operador', async () => {
    const save = vi.fn(async (_payload: { expectedCampaignUpdatedAt: string | null; expectedRequestUpdatedAt: Record<string, string | null> }) => { void _payload; return { ok: false, status, campaignUpdatedAt: 'v2', requestUpdatedAt: {}, message: 'La campaña ha sido modificada por otro usuario.' }; });
    Object.defineProperty(window, 'traccion', { configurable: true, value: { saveLoteriaSnapshotIfUnchanged: save } });
    const before = useLoteriaStore.getState().campaign;
    const withClose = { ...before, cashArqueos: [{ id: 'a1', at: new Date().toISOString(), expected: 0, counted: 0, difference: 0, cashPaid: 0, movementNet: 0, recordedBy: 'Operador', payments: [], movements: [] }] };
    const result = await useLoteriaStore.getState().saveCampaign(withClose);
    expect(result.ok).toBe(false);
    expect(save.mock.calls[0][0].expectedCampaignUpdatedAt).toBe('v1');
    expect(useLoteriaStore.getState().campaign).toBe(before);
    expect(useLoteriaStore.getState().campaignUpdatedAt).toBe('v1');
  });
  it('rechaza cambios simultáneos de cobros con token obsoleto', async () => {
    const save = vi.fn(async (_payload: { expectedCampaignUpdatedAt: string | null; expectedRequestUpdatedAt: Record<string, string | null> }) => { void _payload; return { ok: false, status, campaignUpdatedAt: 'v2', requestUpdatedAt: { r1: 'v2' }, message: 'Otro usuario modificó los pagos.' }; });
    Object.defineProperty(window, 'traccion', { configurable: true, value: { saveLoteriaSnapshotIfUnchanged: save } });
    useLoteriaStore.setState({ requestUpdatedAt: { r1: 'v1' } });
    const result = await useLoteriaStore.getState().saveCampaign({ ...createDefaultLotteryCampaign(2026), requests: [{
      id: 'r1', nombre: 'Persona', email: '', empleado: null, externa: true, contactoObservaciones: '',
      decimosNumero1: 1, decimosNumero2: 0, pagado: true, fechaPago: new Date().toISOString(),
      formaPago: 'efectivo', observacionesPago: '', createdAt: '', updatedAt: '',
    }] });
    expect(result.ok).toBe(false);
    expect(save.mock.calls[0][0].expectedRequestUpdatedAt).toEqual({ r1: 'v1' });
    expect(useLoteriaStore.getState().campaign.requests).toHaveLength(0);
  });
});
