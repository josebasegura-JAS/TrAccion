import { describe, expect, it } from 'vitest';
import { createDefaultLotteryCampaign } from './loteria';
import { cashChangesSinceLastClose, cashExpected, cashSnapshot, parseCashAmount } from './arqueos';

describe('arqueos de lotería', () => {
  it('rechaza fracciones de céntimo, ceros y entradas inválidas', () => {
    expect(parseCashAmount('0,001', false)).toBeNull();
    expect(parseCashAmount('0', false)).toBeNull();
    expect(parseCashAmount('-0,01', false)).toBe(-0.01);
    expect(parseCashAmount('10,25', false)).toBe(10.25);
    expect(parseCashAmount('0,00', true)).toBe(0);
    expect(parseCashAmount('-1', true)).toBeNull();
  });
  const campaign = () => {
    const c = createDefaultLotteryCampaign(2026);
    c.requests.push({
      id: 'p1', nombre: 'Ejemplo', email: '', empleado: null, externa: true, contactoObservaciones: '',
      decimosNumero1: 1, decimosNumero2: 0, pagado: true, fechaPago: '2026-11-02T09:00:00Z',
      formaPago: 'efectivo', observacionesPago: '', createdAt: '', updatedAt: '',
    });
    return c;
  };
  it('oculta pagos electrónicos del efectivo esperado', () => {
    const c = campaign();
    c.requests[0].formaPago = 'bizum';
    expect(cashExpected(c)).toBe(0);
    c.requests[0].formaPago = 'transferencia';
    expect(cashExpected(c)).toBe(0);
  });
  it('cierra el primer arqueo contra el saldo de caja', () => {
    const c = campaign();
    const close = cashSnapshot(c, 20, '2026-11-02T12:00:00Z', 'a1');
    expect(close.expected).toBe(20);
    expect(close.difference).toBe(0);
    c.cashArqueos = [close];
    c.requests.push({ ...c.requests[0], id: 'p2', nombre: 'Segundo' });
    expect(cashExpected(c)).toBe(40);
    expect(cashChangesSinceLastClose(c)).toContain('Segundo: +20.00 € en efectivo');
    expect(close.payments).toHaveLength(1);
  });
  it('registra retiradas sin descontar por segunda vez los pagos históricos', () => {
    const c = campaign();
    c.cashArqueos = [cashSnapshot(c, 20, '2026-11-02T12:00:00Z', 'a1')];
    c.cashMovements = [{ id: 'm1', at: '2026-11-02T13:00:00Z', amount: -5, reason: 'Entrega' }];
    expect(cashExpected(c)).toBe(15);
    const close = cashSnapshot(c, 15, '2026-11-02T14:00:00Z', 'a2');
    c.cashArqueos.push(close);
    expect(cashExpected(c)).toBe(15);
    expect(close.movements).toHaveLength(1);
  });
  it('registra diferencias y emplea el recuento como siguiente saldo inicial', () => {
    const c = campaign();
    const close = cashSnapshot(c, 18, '2026-11-02T12:00:00Z', 'a1');
    expect(close.difference).toBe(-2);
    c.cashArqueos = [close];
    expect(cashExpected(c)).toBe(18);
  });
  it('detecta cambios retroactivos en el medio de cobro', () => {
    const c = campaign();
    c.cashArqueos = [cashSnapshot(c, 20, '2026-11-02T12:00:00Z', 'a1')];
    c.requests[0].formaPago = 'bizum';
    expect(cashExpected(c)).toBe(0);
    expect(cashChangesSinceLastClose(c)[0]).toContain('-20.00 €');
  });
});
