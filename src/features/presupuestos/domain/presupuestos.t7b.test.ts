import { describe, expect, it } from 'vitest';
import { buildBudgetScenarioExportData, getBudgetScenarioFinalAnnualTotals, buildBudgetActualDashboardData, calculateBudgetManualItemMonth, calculateBudgetManualItemYear, normalizeBudgetNumber, normalizeBudgetRate, validateBudgetManualItem, type BudgetScenario, type BudgetManualItem, type BudgetActual } from './presupuestos';

const stamp = '2026-01-01T00:00:00.000Z';
const scenario: BudgetScenario = { id: 'a', name: 'Plan', year: 2026, ticketAmount: 14.57, notes: '', createdAt: stamp, updatedAt: stamp };
const item: BudgetManualItem = { id: 'm', scenarioId: 'a', concept: 'Uniformidad', category: 'Vestuario', monthlyAmount: 100, annualAmount: 0, notes: '', displayOrder: 1, createdAt: stamp, updatedAt: stamp };
const actual: BudgetActual = { id: 'r', year: 2026, month: 2, block: 'Vestuario', concept: 'Dotación', amount: 150, notes: '', createdAt: stamp, updatedAt: stamp };
describe('T7B: precisión y cierre presupuestario', () => {
  it('calcula el desglose por precio y unidades sin sumar importes directos', () => {
    const breakdown: BudgetManualItem = { ...item, calculationMode: 'breakdown', annualAmount: 9999, subitems: [{ id: 's', concept: 'Prenda', unitPrice: 14.57, units: 3, notes: '' }] };
    expect(calculateBudgetManualItemYear(breakdown)).toBe(43.71);
    expect(calculateBudgetManualItemMonth(breakdown)).toBe(3.64);
  });
  it('respeta importes definitivos cero y no incluye partidas de otros escenarios o dadas de baja', () => {
    const finalized = { ...scenario, finalizedAt: stamp, finalBudgetAmounts: { 'manual:m': 0, ticket: 300 } };
    expect(getBudgetScenarioFinalAnnualTotals(finalized, [item, { ...item, id: 'b', scenarioId: 'b' }, { ...item, id: 'c', deletedAt: stamp }], [], 2026)).toEqual({ manualTotal: 0, ticketTotal: 300, total: 300 });
  });
  it('conserva cálculo original de partidas sin importe definitivo', () => {
    const finalized = { ...scenario, finalizedAt: stamp, finalBudgetAmounts: { ticket: 300 } };
    expect(getBudgetScenarioFinalAnnualTotals(finalized, [item], [], 2026)).toEqual({ manualTotal: 1200, ticketTotal: 300, total: 1500 });
  });
  it('prorratea presupuesto cerrado y excluye gastos fuera del corte, ejercicio o dados de baja', () => {
    const finalized = { ...scenario, finalizedAt: stamp, finalBudgetAmounts: { 'manual:m': 2400, ticket: 1200 } };
    const result = buildBudgetActualDashboardData(finalized, [item], [], [actual, { ...actual, id: 'later', month: 4 }, { ...actual, id: 'old', year: 2025 }, { ...actual, id: 'deleted', deletedAt: stamp }], 2026, 3);
    expect(result).toMatchObject({ budgetTotal: 900, actualTotal: 150, difference: 750 });
  });
  it('exporta únicamente partidas activas del escenario elegido', () => {
    expect(buildBudgetScenarioExportData(scenario, [item, { ...item, id: 'b', scenarioId: 'b' }, { ...item, id: 'c', deletedAt: stamp }], [])).toEqual([{ block: 'Partidas manuales', concept: 'Uniformidad', category: 'Vestuario', annualTotal: 1200, notes: '' }]);
  });
  it.each([['1.234,56', 1234.56], [' 14,57 ', 14.57], ['incorrecto', 0]])('normaliza importe %s', (raw, expected) => expect(normalizeBudgetNumber(raw)).toBe(expected));
  it('acota porcentajes y evita desgloses sin conceptos', () => {
    expect(normalizeBudgetRate('6%')).toBe(0.06);
    expect(normalizeBudgetRate(150)).toBe(1);
    expect(normalizeBudgetRate(-5)).toBe(0);
    expect(validateBudgetManualItem({ ...item, calculationMode: 'breakdown', subitems: [] }).valid).toBe(false);
  });
});
