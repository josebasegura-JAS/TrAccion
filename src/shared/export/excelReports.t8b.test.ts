// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { exportPresupuestoScenarioToExcel } from '../../features/presupuestos/domain/exportPresupuestoExcel';
import type { BudgetScenario, BudgetManualItem, BudgetTicketGroup } from '../../features/presupuestos/domain/presupuestos';
import { buildTaskReportHtml, exportTaskReportToExcel } from '../../features/tareas/export/taskReport';
import { EMPTY_TASK_DRAFT, type Task, type TaskDraft } from '../../features/tareas/domain/task';

const open = vi.hoisted(() => vi.fn());
vi.mock('./tableExport', async original => ({ ...await original<typeof import('./tableExport')>(), openWorkbookInExcel: open }));
const stamp = '2026-01-01T00:00:00.000Z';
const scenario: BudgetScenario = { id: 'a', name: 'Plan 2026', year: 2026, ticketAmount: 14.57, notes: '', createdAt: stamp, updatedAt: stamp, deletedAt: null };
const manual: BudgetManualItem = { id: 'm', scenarioId: 'a', concept: 'Uniformidad', category: 'Vestuario', monthlyAmount: 100, annualAmount: 0, notes: '', displayOrder: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };
const group: BudgetTicketGroup = { id: 'g', scenarioId: 'a', name: 'Grupo', peopleCount: 1, ticketCalendar: '', absenceRate: 0, ticketAmount: 14.57, calculationType: 'manual_tickets', manualTickets: 10, annualTickets: 0, manualMonthlyAmount: 0, notes: '', displayOrder: 1, createdAt: stamp, updatedAt: stamp, deletedAt: null };
const input = { scenario, manualItems: [manual], ticketGroups: [group], calendars: [], people: [], generatedAt: new Date(2026, 0, 1) };
const draft: TaskDraft = { ...EMPTY_TASK_DRAFT, titulo: 'Revisión / jornada', descripcion: 'Descripción <b>literal</b>', observaciones: '=1+1', responsable: 'Persona ficticia', fechaLimite: '2026-02-01' };
const task: Task = { ...draft, id: 'task-a', createdAt: stamp, updatedAt: stamp, deletedAt: null, closedAt: null, sessionDocumentCode: '', sessionModule: '', sessionDate: '', seguimiento: [{ fechaHora: stamp, texto: '[[traccion-seguimiento:{"fecha":"2026-02-03","usuario":"Persona A"}]]\nTexto & detalle' }, { fechaHora: stamp, texto: 'Histórico' }] };
async function readOutput() {
  expect(open).toHaveBeenCalledTimes(1);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(open.mock.calls[0][0]);
  return workbook;
}
beforeEach(() => { open.mockReset(); open.mockResolvedValue(undefined); });
describe('T8B: archivos Excel de Presupuestos y Tareas', () => {
  it('exporta simulación con importes numéricos y excluye otras partidas y bajas', async () => {
    await exportPresupuestoScenarioToExcel({ ...input, mode: 'simulation', manualItems: [manual, { ...manual, id: 'deleted', deletedAt: stamp }, { ...manual, id: 'other', scenarioId: 'b' }] });
    const book = await readOutput();
    const sheet = book.getWorksheet('Presupuesto 2026')!;
    expect(sheet.getCell('D9').value).toBeCloseTo(1748.4, 2);
    expect(sheet.getCell('D10').value).toBe(1200);
    expect(sheet.getCell('A11').value).toBe('TOTAL GENERAL');
    expect(sheet.getCell('D11').value).toBeCloseTo(2948.4, 2);
    expect(book.getWorksheet('Detalle partidas')!.getCell('G5').value).toBe(1200);
    expect(open.mock.calls[0][1]).toBe('simulacion_rrll_2026_plan_2026.xlsx');
  });
  it('conserva importes definitivos cero y diferencias con signo', async () => {
    await exportPresupuestoScenarioToExcel({ ...input, mode: 'final', finalAmounts: { ticket: 1500, 'manual:m': 0 } });
    const sheet = (await readOutput()).getWorksheet('Presupuesto 2026')!;
    expect(sheet.getCell('E9').value).toBe(1500);
    expect(sheet.getCell('E10').value).toBe(0);
    expect(sheet.getCell('F10').value).toBe(-1200);
    expect(sheet.getCell('E11').value).toBe(1500);
    expect(sheet.getCell('F11').value).toBeCloseTo(-1448.4, 2);
  });
  it('conserva precio, unidades y subtotal de partidas desglosadas', async () => {
    await exportPresupuestoScenarioToExcel({ ...input, mode: 'simulation', manualItems: [{ ...manual, calculationMode: 'breakdown', subitems: [{ id: 's', concept: 'Prenda', unitPrice: 14.57, units: 3, notes: '' }] }] });
    const book = await readOutput();
    const detail = book.getWorksheet('Detalle partidas')!;
    expect(detail.getCell('E5').value).toBe(14.57);
    expect(detail.getCell('F5').value).toBe(3);
    expect(detail.getCell('G5').value).toBe(43.71);
    expect(detail.getCell('G6').value).toBe(43.71);
  });
  it('genera libro de tarea con seguimiento moderno y legacy, y texto no ejecutable', async () => {
    await exportTaskReportToExcel({ task, draft });
    const sheet = (await readOutput()).getWorksheet('Detalle tarea')!;
    expect(sheet.getCell('A3').value).toBe(draft.titulo);
    expect(sheet.getCell('D7').value).toBe('01/02/2026');
    expect(sheet.getCell('A17').value).toBe('03/02/2026');
    expect(sheet.getCell('B17').value).toBe('Persona A');
    expect(sheet.getCell('C17').value).toBe('Texto & detalle');
    expect(sheet.getCell('B18').value).toBe('—');
    expect(sheet.getCell('C18').value).toBe('Histórico');
    expect(sheet.getCell('A21').value).toBe('=1+1');
    expect(sheet.getCell('A21').type).toBe(ExcelJS.ValueType.String);
    expect(open.mock.calls[0][1]).toBe('Tarea_Revision_jornada.xlsx');
  });
  it('escapa HTML del informe y no muestra metadatos internos del seguimiento', () => {
    const html = buildTaskReportHtml({ task, draft });
    expect(html).toContain('Descripción &lt;b&gt;literal&lt;/b&gt;');
    expect(html).toContain('Texto &amp; detalle');
    expect(html).toContain('Persona A');
    expect(html).not.toContain('[[traccion-seguimiento:');
  });
  it('muestra valores vacíos sin inventar seguimientos', async () => {
    const empty = { ...EMPTY_TASK_DRAFT };
    const emptyTask = { ...task, ...empty, seguimiento: [] };
    expect(buildTaskReportHtml({ task: emptyTask, draft: empty })).toContain('Sin seguimientos registrados.');
    await exportTaskReportToExcel({ task: emptyTask, draft: empty });
    const sheet = (await readOutput()).getWorksheet('Detalle tarea')!;
    expect(sheet.getCell('A3').value).toBe('Tarea sin título');
    expect(sheet.getCell('A17').value).toBe('Sin seguimientos registrados.');
  });
});
