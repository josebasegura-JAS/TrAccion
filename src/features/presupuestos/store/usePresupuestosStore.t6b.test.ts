import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePresupuestosStore, type BudgetScenarioDraft, type BudgetManualItemDraft, type BudgetTicketGroupDraft, type BudgetActualDraft } from './usePresupuestosStore';

const mocks = vi.hoisted(() => ({ available: vi.fn(), load: vi.fn(), save: vi.fn(), read: vi.fn(), write: vi.fn() }));
vi.mock('./presupuestosSqliteRepository', () => ({
  hasPresupuestosSqliteRepository: mocks.available, loadPresupuestosFromSqlite: mocks.load, savePresupuestosToSqlite: mocks.save,
}));
vi.mock('../../../services/persistence', () => ({ readStorageItem: mocks.read, writeJsonStorageAsync: mocks.write }));

const stamp = '2026-01-01T00:00:00.000Z';
const scenario: BudgetScenarioDraft = { name: 'Plan', year: 2026, ticketAmount: 14.57, notes: '' };
const base = { ...scenario, id: 'a', createdAt: stamp, updatedAt: stamp, deletedAt: null };
const manual: BudgetManualItemDraft = { scenarioId: 'a', concept: 'Uniformidad', category: 'Vestuario', monthlyAmount: 100, annualAmount: 0, notes: '' };
const ticket: BudgetTicketGroupDraft = { scenarioId: 'a', name: 'Grupo', peopleCount: 5, ticketCalendar: '', absenceRate: 0.03, ticketAmount: 14.57, calculationType: 'manual_tickets', manualTickets: 10, annualTickets: 0, manualMonthlyAmount: 0, notes: '' };
const actual: BudgetActualDraft = { year: 2026, month: 1, block: 'Vestuario', concept: 'Dotación', amount: 200, notes: '' };
const item = { ...manual, id: 'm', displayOrder: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };
const group = { ...ticket, id: 'g', displayOrder: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };
const state = () => usePresupuestosStore.getState();
beforeEach(() => {
  vi.resetAllMocks();
  mocks.available.mockReturnValue(true);
  mocks.save.mockResolvedValue({ ok: true, currentUpdatedAt: 'next', message: 'guardado' });
  mocks.write.mockResolvedValue({ ok: true });
  usePresupuestosStore.setState({ scenarios: [base], manualItems: [item], ticketGroups: [group], actuals: [], activeScenarioId: 'a', sqliteUpdatedAt: stamp });
});
describe('T6B: operaciones de Presupuestos', () => {
  it('normaliza el escenario y envía la versión OCC al editar', async () => {
    expect(await state().upsertScenario({ ...scenario, name: ' Plan revisado ' }, 'a')).toMatchObject({ ok: true, id: 'a' });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ scenarios: [expect.objectContaining({ name: 'Plan revisado', createdAt: stamp })] }), stamp);
    expect(state().sqliteUpdatedAt).toBe('next');
  });
  it('rechaza escenario inválido antes de escribir', async () => {
    expect(await state().upsertScenario({ ...scenario, name: ' ' })).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('no aplica una simulación rechazada por conflicto OCC', async () => {
    mocks.save.mockResolvedValue({ ok: false, message: 'conflicto' });
    expect(await state().saveScenarioSimulation('a', { ...scenario, name: 'Nuevo' }, [{ id: 'm', draft: { ...manual, monthlyAmount: 300 } }])).toMatchObject({ ok: false });
    expect(state().scenarios).toEqual([base]);
    expect(state().manualItems).toEqual([item]);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it('confirma escenario y partidas en una única llamada de simulación', async () => {
    expect(await state().saveScenarioSimulation('a', { ...scenario, name: 'Nuevo' }, [{ id: 'm', draft: { ...manual, monthlyAmount: 300 } }])).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(state().scenarios[0].name).toBe('Nuevo');
    expect(state().manualItems[0].monthlyAmount).toBe(300);
  });
  it('duplica las partidas y grupos sin reutilizar IDs ni arrastrar el cierre', async () => {
    usePresupuestosStore.setState({ scenarios: [{ ...base, selectedForExecution: true, finalizedAt: stamp, finalBudgetAmounts: { Vestuario: 100 } }] });
    const result = await state().duplicateScenario('a');
    expect(result.ok).toBe(true);
    const copy = state().scenarios.find(s => s.id === result.id);
    expect(copy).toMatchObject({ selectedForExecution: false, finalizedAt: null, finalBudgetAmounts: {} });
    expect(state().manualItems.find(m => m.scenarioId === result.id)?.id).not.toBe('m');
    expect(state().ticketGroups.find(g => g.scenarioId === result.id)?.id).not.toBe('g');
  });
  it('elimina lógicamente escenario y elementos dependientes en el mismo commit', async () => {
    expect(await state().removeScenario('a')).toMatchObject({ ok: true });
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(state().scenarios[0].deletedAt).toBeTruthy();
    expect(state().manualItems[0].deletedAt).toBeTruthy();
    expect(state().ticketGroups[0].deletedAt).toBeTruthy();
    expect(state().activeScenarioId).toBeNull();
  });
  it('edita y elimina una partida manual conservando su identidad', async () => {
    expect(await state().upsertManualItem({ ...manual, monthlyAmount: 300 }, 'm')).toMatchObject({ ok: true });
    expect(state().manualItems[0]).toMatchObject({ id: 'm', monthlyAmount: 300, createdAt: stamp });
    expect(await state().removeManualItem('m')).toMatchObject({ ok: true });
    expect(state().manualItems[0].deletedAt).toBeTruthy();
  });
  it('edita y elimina un grupo de tickets', async () => {
    expect(await state().upsertTicketGroup({ ...ticket, manualTickets: 25 }, 'g')).toMatchObject({ ok: true });
    expect(state().ticketGroups[0].manualTickets).toBe(25);
    expect(await state().removeTicketGroup('g')).toMatchObject({ ok: true });
    expect(state().ticketGroups[0].deletedAt).toBeTruthy();
  });
  it('rechaza un gasto real con mes inválido y guarda y elimina uno válido', async () => {
    expect(await state().upsertActual({ ...actual, month: 13 })).toMatchObject({ ok: false });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(await state().upsertActual(actual, 'real')).toMatchObject({ ok: true });
    expect(state().actuals[0]).toMatchObject({ id: 'real', amount: 200 });
    expect(await state().removeActual('real')).toMatchObject({ ok: true });
    expect(state().actuals[0].deletedAt).toBeTruthy();
  });
  it('selecciona un escenario por ejercicio sin afectar otros años', async () => {
    usePresupuestosStore.setState({ scenarios: [base, { ...base, id: 'b', selectedForExecution: true }, { ...base, id: 'c', year: 2025, selectedForExecution: true }] });
    expect(await state().selectScenarioForExecution('a')).toMatchObject({ ok: true });
    expect(state().scenarios.map(s => s.selectedForExecution)).toEqual([true, false, true]);
  });
  it('normaliza importes definitivos y conserva el resultado confirmado incluso si falla la caché', async () => {
    mocks.write.mockResolvedValue({ ok: false, message: 'cache' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      expect(await state().finalizeScenarioBudget('a', { Vestuario: 200, Otros: -50 })).toMatchObject({ ok: true });
      expect(state().scenarios[0].finalBudgetAmounts).toEqual({ Vestuario: 200, Otros: 0 });
      expect(state().sqliteUpdatedAt).toBe('next');
    } finally { warn.mockRestore(); }
  });
});
