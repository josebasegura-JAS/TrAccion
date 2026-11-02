import { describe, expect, it } from 'vitest';
import { validateCashHistoryAppendOnly } from './loteriaRepository.js';

const close = { id: 'a1', at: '2026-11-02T09:00:00Z', expected: 20, counted: 20, difference: 0, cashPaid: 20, movementNet: 0, recordedBy: 'Operador', payments: [], movements: [] };
const move = { id: 'm1', at: '2026-11-02T09:10:00Z', amount: -5, reason: 'Entrega al lotero', recordedBy: 'Operador' };
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
  it('valida importes, estructura y responsable de nuevos registros, sin alterar registros históricos', () => {
    expect(validateCashHistoryAppendOnly(raw([], []), raw([{ ...close, counted: Number.NaN }], []))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([{ ...close, difference: 1 }], []))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([{ ...close, recordedBy: '' }], []))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([], [{ ...move, amount: 0.001 }]))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([], [{ ...move, recordedBy: '' }]))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), raw([{ ...close, payments: [{ id: 'p1', nombre: 'X', amount: -2, formaPago: 'efectivo', fechaPago: null }] }], []))).toBe(false);
    const oldClose = { id: 'legacy', at: close.at, expected: 20, counted: 20, difference: 0 };
    expect(validateCashHistoryAppendOnly(raw([oldClose], []), raw([oldClose, close], [move]))).toBe(true);
  });
  it('rechaza identificadores repetidos, datos malformados y modificaciones silenciosas', () => {
    expect(validateCashHistoryAppendOnly(raw([close], []), raw([close, close], []))).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([], []), '{no json')).toBe(false);
    expect(validateCashHistoryAppendOnly(raw([close], []), raw([close], []))).toBe(true);
  });
});
