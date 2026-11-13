import { describe, expect, it } from 'vitest';
import { createSqliteWriterOperationLedger } from './sqliteWriterOperationLedger.js';

describe('PR9D-5A · libro de escrituras del worker', () => {
  it('exige un id único y una generación válida', () => {
    const ledger = createSqliteWriterOperationLedger();
    expect(() => ledger.begin('', 1)).toThrow();
    expect(() => ledger.begin('save:1', 0)).toThrow();
    ledger.begin('save:1', 2);
    expect(() => ledger.begin('save:1', 3)).toThrow();
    expect(ledger.get('save:1')).toEqual({ id: 'save:1', generation: 2, state: 'submitted' });
  });

  it('no acepta confirmaciones antiguas ni fuera de orden', () => {
    const ledger = createSqliteWriterOperationLedger();
    ledger.begin('save:1', 2);
    expect(() => ledger.complete('save:1', 2)).toThrow();
    expect(() => ledger.acknowledge('save:1', 1)).toThrow();
    ledger.acknowledge('save:1', 2);
    ledger.complete('save:1', 2);
    expect(ledger.get('save:1')?.state).toBe('completed');
    expect(() => ledger.acknowledge('save:1', 2)).toThrow();
  });

  it('si cae el worker, marca sin reintentar operaciones pendientes', () => {
    const ledger = createSqliteWriterOperationLedger();
    ledger.begin('save:1', 2);
    ledger.acknowledge('save:1', 2);
    ledger.begin('save:2', 2);
    ledger.begin('save:3', 3);
    ledger.acknowledge('save:3', 3);
    ledger.complete('save:3', 3);
    expect(ledger.markGenerationUncertain(2)).toEqual(['save:1', 'save:2']);
    expect(ledger.hasUnknownOperations()).toBe(true);
    expect(ledger.get('save:1')?.state).toBe('unknown');
    expect(ledger.get('save:3')?.state).toBe('completed');
    expect(() => ledger.complete('save:1', 2)).toThrow();
    expect(() => ledger.begin('save:1', 2)).toThrow();
    ledger.reconcile('save:1', 2);
    expect(ledger.hasUnknownOperations()).toBe(true);
    ledger.reconcile('save:2', 2);
    expect(ledger.hasUnknownOperations()).toBe(false);
    expect(() => ledger.reconcile('save:3', 3)).toThrow();
  });
});
