import { describe, expect, it } from 'vitest';
import { createDefaultLotteryCampaign } from './loteria';
import { selectCurrentLotteryCampaignYear } from './loteriaCampaignYear';
import { buildLotteryHistoricalSummaries } from './loteriaHistory';

describe('cierre y nueva campaña de Lotería', () => {
  it('prepara nueva campaña sin arrastrar participantes, pagos, arqueos o etapas cerradas', () => {
    const next = createDefaultLotteryCampaign(2027);
    expect(next.year).toBe(2027);
    expect(next.requests).toEqual([]);
    expect(next.cashArqueos).toEqual([]);
    expect(next.cashMovements).toEqual([]);
    expect(next.workflow.seguimientoFinalizado).toBe(false);
    expect(next.workflow.campanaCerrada).toBe(false);
  });

  it('selecciona la campaña del año siguiente abierta anticipadamente', () => {
    expect(selectCurrentLotteryCampaignYear(['2025', '2026', '2027'], 2026)).toBe(2027);
    expect(selectCurrentLotteryCampaignYear(['2025', '2026'], 2026)).toBe(2026);
    expect(selectCurrentLotteryCampaignYear(['2024', '2025'], 2026)).toBe(2026);
    expect(selectCurrentLotteryCampaignYear(['2029'], 2026)).toBe(2026);
  });

  it('mantiene visible la campaña cerrada de 2026 en histórico al abrir 2027', () => {
    const prior = createDefaultLotteryCampaign(2026);
    prior.workflow.seguimientoFinalizado = true;
    prior.workflow.campanaCerrada = true;
    const next = createDefaultLotteryCampaign(2027);
    const rows = buildLotteryHistoricalSummaries([
      { id: '2026', value: JSON.stringify(prior) },
      { id: '2027', value: JSON.stringify(next) },
    ], [], 2027);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ year: 2026, closed: true });
  });
});
