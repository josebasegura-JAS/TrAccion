/** Consulta histórica de solo lectura: nunca prepara escrituras ni modifica la campaña activa. */
export interface LotteryHistoricalSummary {
  year: number;
  numero1: string;
  numero2: string;
  participants: number;
  requested: number;
  paid: number;
  pending: number;
  closed: boolean;
}
export interface LotteryHistoryRecord {
  id: string;
  value: string;
  campaignYear?: number;
}
export function buildLotteryHistoricalSummaries(
  campaignRecords: readonly LotteryHistoryRecord[],
  requestRecords: readonly LotteryHistoryRecord[],
  activeYear: number,
): LotteryHistoricalSummary[] {
  return campaignRecords.flatMap((record) => {
    const year = Number(record.id);
    if (!Number.isInteger(year) || year >= activeYear || year < 2000) return [];
    let campaign: unknown;
    try { campaign = JSON.parse(record.value); } catch { return []; }
    if (!campaign || typeof campaign !== 'object' || Array.isArray(campaign)) return [];
    const saved = campaign as Record<string, unknown>;
    if (typeof saved.numero1 !== 'string' || typeof saved.numero2 !== 'string') return [];
    let requested = 0;
    let paid = 0;
    let pending = 0;
    let participants = 0;
    const price = typeof saved.precioDecimo === 'number' && Number.isFinite(saved.precioDecimo) ? saved.precioDecimo : 0;
    for (const item of requestRecords.filter((request) => request.campaignYear === year)) {
      let raw: unknown;
      try { raw = JSON.parse(item.value); } catch { throw new Error(`Solicitud histórica ${item.id} ilegible (${year}).`); }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Solicitud histórica ${item.id} inválida (${year}).`);
      const request = raw as Record<string, unknown>;
      const one = typeof request.decimosNumero1 === 'number' ? request.decimosNumero1 : 0;
      const two = typeof request.decimosNumero2 === 'number' ? request.decimosNumero2 : 0;
      const count = Math.max(0, one) + Math.max(0, two);
      if (!Number.isFinite(count)) throw new Error(`Cantidad inválida en solicitud ${item.id} (${year}).`);
      if (count === 0) continue;
      participants++;
      requested += count;
      if (request.pagado === true) paid += count * price;
      else pending += count * price;
    }
    return [{ year, numero1: saved.numero1, numero2: saved.numero2, participants, requested, paid, pending, closed: Boolean((saved.workflow as Record<string, unknown> | undefined)?.campanaCerrada) }];
  }).sort((a, b) => b.year - a.year);
}
