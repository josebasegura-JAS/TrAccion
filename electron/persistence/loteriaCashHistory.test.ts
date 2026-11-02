import { describe, expect, it } from 'vitest';
import { validateCashHistoryAppendOnly } from './loteriaRepository.js';

const close = { id: 'a1', at: '2026-11-02T09:00:00Z', expected: 20, counted: 20, difference: 0 };
const move = { id: 'm1', at: '2026-11-02T09:10:00Z', amount: -5, reason: 'Entrega al lotero' };
const raw = (cashArqueos: unknown[], cashMovements: unknown[]) => JSON.stringify({ cashArqueos, cashMovements, workflow: {} });

describe('histórico de caja de Lotería en SQLite', () => {
  it('permite crear campaña y añadir cierres y movimientos', () => {
    expect(validateCashHistoryAppendOnly(null, raw([], []))).toBe(true);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([close], [move]))).toBe(true);
    expect(validateCashHistoryAppendOnly(raw([close], [move]), raw([close, { ...close, id: 'a2' }], [move]))).toBe(true);
  });
  it('impide reescribir, eliminar o reemplazar movimientos registrados', () => {
    expect(validateCashHistoryAppendOnly(raw([close], [move]), raw([{ ...close, counted: 19 }], [move]))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([close], [move]), raw([], [move]))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([close], [move]), raw([close], [{ ...move, amount: -10 }]))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([close], [move]), raw([close], []))).toBe(false);
  });
  it('rechaza identificadores repetidos, datos malformados y modificaciones silenciosas', () => {
    expect(validateCashHistoryAppendOnly(raw([close], []), raw([close, close], []))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), '{no json')).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([close], []), raw([close], []))).toBe(true);
  });
});
