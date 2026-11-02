import { lotteryCashOnHand, lotteryRequestAmount, type LotteryCampaign } from './loteria';

export interface LotteryCashMovement {
  id: string;
  at: string;
  amount: number; // Negativo: salida; positivo: entrada no vinculada a un cobro.
  reason: string;
}

export interface LotteryCashSnapshot {
  id: string;
  at: string;
  expected: number;
  counted: number;
  difference: number;
  cashPaid: number;
  movementNet: number;
  payments: { id: string; nombre: string; amount: number; formaPago: string; fechaPago: string | null }[];
  movements: LotteryCashMovement[];
}

export function cashMovementsNet(campaign: LotteryCampaign): number {
  return (campaign.cashMovements ?? []).reduce((total, movement) => total + movement.amount, 0);
}

export function cashExpected(campaign: LotteryCampaign): number {
  const previous = campaign.cashArqueos?.[campaign.cashArqueos.length - 1];
  const currentPaid = lotteryCashOnHand(campaign);
  const movementNet = cashMovementsNet(campaign);
  return roundCents(previous
    ? previous.counted + currentPaid - previous.cashPaid + movementNet - previous.movementNet
    : currentPaid + movementNet);
}

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function cashSnapshot(campaign: LotteryCampaign, counted: number, at: string, id: string): LotteryCashSnapshot {
  const expected = cashExpected(campaign);
  return {
    id, at, expected, counted: roundCents(counted),
    difference: roundCents(counted - expected),
    cashPaid: lotteryCashOnHand(campaign),
    movementNet: cashMovementsNet(campaign),
    payments: campaign.requests.filter((request) => request.pagado).map((request) => ({
      id: request.id, nombre: request.nombre,
      amount: lotteryRequestAmount(campaign, request),
      formaPago: request.formaPago, fechaPago: request.fechaPago,
    })),
    movements: (campaign.cashMovements ?? []).map((movement) => ({ ...movement })),
  };
}

export function cashChangesSinceLastClose(campaign: LotteryCampaign): string[] {
  const previous = campaign.cashArqueos?.[campaign.cashArqueos.length - 1];
  if (!previous) return ['Primer arqueo: se comparará el efectivo con todos los pagos en efectivo registrados.'];
  const previousById = new Map(previous.payments.map((payment) => [payment.id, payment]));
  const changes: string[] = [];
  for (const request of campaign.requests) {
    const before = previousById.get(request.id);
    const amount = request.pagado ? lotteryRequestAmount(campaign, request) : 0;
    const currentCash = request.pagado && request.formaPago === 'efectivo' ? amount : 0;
    const oldCash = before?.formaPago === 'efectivo' ? before.amount : 0;
    if (roundCents(currentCash - oldCash) !== 0) {
      changes.push(`${request.nombre}: ${roundCents(currentCash - oldCash) > 0 ? '+' : ''}${roundCents(currentCash - oldCash).toFixed(2)} € en efectivo`);
    }
    previousById.delete(request.id);
  }
  for (const removed of previousById.values()) {
    if (removed.formaPago === 'efectivo') changes.push(`${removed.nombre}: -${removed.amount.toFixed(2)} € (registro eliminado)`);
  }
  for (const movement of (campaign.cashMovements ?? []).filter((entry) => !previous.movements.some((old) => old.id === entry.id && old.amount === entry.amount && old.reason === entry.reason))) {
    changes.push(`${movement.reason}: ${movement.amount > 0 ? '+' : ''}${movement.amount.toFixed(2)} € (movimiento de caja)`);
  }
  return changes;
}
