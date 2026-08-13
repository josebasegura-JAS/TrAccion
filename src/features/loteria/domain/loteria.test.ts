import { describe, expect, it } from 'vitest';
import {
  createDefaultLotteryCampaign,
  lotteryAvailableCount,
  lotteryAvailableCountByNumber,
  lotteryBizumTotal,
  lotteryCashOnHand,
  lotteryOrderedCount,
  lotteryPaidTotal,
  lotteryPendingPaymentAmount,
  lotteryRequestAmount,
  lotteryRequestedCount,
  lotteryRequestedCountByNumber,
  type LotteryRequest,
} from './loteria';

const request = (overrides: Partial<LotteryRequest> = {}): LotteryRequest => ({
  id: 'r1',
  nombre: 'Persona',
  email: '',
  empleado: '123',
  externa: false,
  contactoObservaciones: '',
  decimosNumero1: 1,
  decimosNumero2: 1,
  pagado: false,
  fechaPago: null,
  formaPago: 'efectivo',
  observacionesPago: '',
  createdAt: '2026-08-13T08:00:00.000Z',
  updatedAt: '2026-08-13T08:00:00.000Z',
  ...overrides,
});

describe('loteria', () => {
  it('crea una campaña independiente por año', () => {
    const campaign = createDefaultLotteryCampaign(2027);
    expect(campaign.year).toBe(2027);
    expect(campaign.requests).toEqual([]);
    expect(campaign.workflow.campanaCerrada).toBe(false);
  });

  it('calcula encargados, solicitados y disponibles por número', () => {
    const campaign = {
      ...createDefaultLotteryCampaign(2026),
      decimosNumero1: 50,
      decimosNumero2: 40,
      requests: [request({ decimosNumero1: 2, decimosNumero2: 1 }), request({ id: 'r2', decimosNumero1: 3, decimosNumero2: 4 })],
    };

    expect(lotteryOrderedCount(campaign)).toBe(90);
    expect(lotteryRequestedCountByNumber(campaign, 1)).toBe(5);
    expect(lotteryRequestedCountByNumber(campaign, 2)).toBe(5);
    expect(lotteryRequestedCount(campaign)).toBe(10);
    expect(lotteryAvailableCountByNumber(campaign, 1)).toBe(45);
    expect(lotteryAvailableCountByNumber(campaign, 2)).toBe(35);
    expect(lotteryAvailableCount(campaign)).toBe(80);
  });

  it('calcula cobros y pendiente separando efectivo y Bizum', () => {
    const campaign = {
      ...createDefaultLotteryCampaign(2026),
      precioDecimo: 20,
      requests: [
        request({ id: 'cash', decimosNumero1: 1, decimosNumero2: 0, pagado: true, formaPago: 'efectivo' }),
        request({ id: 'bizum', decimosNumero1: 0, decimosNumero2: 2, pagado: true, formaPago: 'bizum' }),
        request({ id: 'pending', decimosNumero1: 1, decimosNumero2: 1, pagado: false }),
      ],
    };

    expect(lotteryRequestAmount(campaign, campaign.requests[1])).toBe(40);
    expect(lotteryCashOnHand(campaign)).toBe(20);
    expect(lotteryBizumTotal(campaign)).toBe(40);
    expect(lotteryPaidTotal(campaign)).toBe(60);
    expect(lotteryPendingPaymentAmount(campaign)).toBe(40);
  });

  it('no convierte cantidades negativas en demanda ni importes negativos', () => {
    const campaign = {
      ...createDefaultLotteryCampaign(2026),
      precioDecimo: 20,
      requests: [request({ decimosNumero1: -2, decimosNumero2: 1 })],
    };

    expect(lotteryRequestedCount(campaign)).toBe(1);
    expect(lotteryRequestAmount(campaign, campaign.requests[0])).toBe(20);
  });
});
