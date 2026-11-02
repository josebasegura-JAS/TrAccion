import { describe, expect, it } from 'vitest';
import { buildLotteryHistoricalSummaries } from './loteriaHistory';

describe('consulta histórica de Lotería', () => {
  const campaigns = [
    { id: '2025', value: JSON.stringify({ numero1: '11111', numero2: '22222', precioDecimo: 20, workflow: { campanaCerrada: true } }) },
    { id: '2026', value: JSON.stringify({ numero1: '33333', numero2: '44444', precioDecimo: 20 }) },
  ];
  it('solo devuelve ejercicios anteriores sin añadirlos a campaña activa', () => {
    const result = buildLotteryHistoricalSummaries(campaigns, [
      { id: 'a', campaignYear: 2025, value: JSON.stringify({ decimosNumero1: 1, decimosNumero2: 1, pagado: true }) },
      { id: 'b', campaignYear: 2025, value: JSON.stringify({ decimosNumero1: 1, decimosNumero2: 0, pagado: false }) },
    ], 2026);
    expect(result).toEqual([{ year: 2025, numero1: '11111', numero2: '22222', participants: 2, requested: 3, paid: 40, pending: 20, closed: true }]);
    expect(campaigns).toHaveLength(2);
  });
  it('rechaza solicitudes ilegibles sin inventar importes', () => {
    expect(() => buildLotteryHistoricalSummaries(campaigns, [{ id: 'r', campaignYear: 2025, value: '{mal' }], 2026)).toThrow('ilegible');
  });
});
