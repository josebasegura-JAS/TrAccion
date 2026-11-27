// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import { syncTicketRestauranteMonthlyBackup } from './ticketRestauranteMonthlyBackup';
import { DEFAULT_TICKET_RESTAURANT_CONFIG, type TicketPersonCalculation } from '../domain/ticketRestaurante';

const m = vi.hoisted(() => ({ enabled: vi.fn(), getState: vi.fn(), save: vi.fn() }));
vi.mock('../../../shared/export/excelGenerationPolicy', () => ({ isAutomaticExcelEnabled: m.enabled }));
vi.mock('../../configuracion/store/useConfiguracionStore', () => ({ useConfiguracionStore: { getState: m.getState } }));
vi.mock('../../../shared/export/saveExcelBackupWithRetry', () => ({ saveExcelBackupWithRetry: m.save }));
const person: TicketPersonCalculation = {
  empleado: '00100', nombre: 'Ane', apellido1: 'García', apellido2: 'López', dni: '12345678Z', nombreApellidos: 'Ane García López', puesto: 'Técnico', calendario: 'SSCC',
  diasTeoricos: 20, diasSinTicket: 0, ausenciasMes: 0, hojasGastoMes: 0, deudaEntrante: 0, ausenciasAplicadas: 0, deudaPendiente: 0, ticketsFinales: 20, importe: 291.4,
  ausenciaIds: [], ausenciaDiasDescontados: {}, deudaEntranteDetalle: [], deudaAplicadaDetalle: [], deudaPendienteDetalle: [], hojaGastoDetalle: [],
};
const input = { config: DEFAULT_TICKET_RESTAURANT_CONFIG, year: 2026, month: 11, rows: [person], absences: [] };
beforeEach(() => { vi.resetAllMocks(); m.enabled.mockResolvedValue(true); m.getState.mockReturnValue({ rutaExportacionTicketRestaurante: 'fixture-directory' }); m.save.mockResolvedValue(null); });
describe('T8B: copia mensual de Ticket Restaurante', () => {
  it('genera el libro mensual real con cantidades, precio, fechas y fórmula de suma', async () => {
    expect(await syncTicketRestauranteMonthlyBackup(input)).toBeNull();
    expect(m.save).toHaveBeenCalledTimes(1);
    const payload = m.save.mock.calls[0][0];
    expect(payload).toMatchObject({ directory: 'fixture-directory', fileName: 'Computo_Noviembre_2026.xlsx', cleanupPrefix: 'Computo_Noviembre_2026' });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(payload.buffer);
    const sheet = book.worksheets[0];
    expect(sheet.getCell('A7').value).toBe('Ane');
    expect(sheet.getCell('F7').value).toBe('00100');
    expect(sheet.getCell('G7').value).toBe(20);
    expect(sheet.getCell('H7').value).toBe(14.57);
    expect(sheet.getCell('I7').value).toBe(291.4);
    expect(sheet.getCell('J7').value).toBeInstanceOf(Date);
    expect(sheet.getCell('N3').value).toMatchObject({ formula: 'SUM(I7:I7)' });
  });
  it('no genera copia automática si la política la desactiva', async () => {
    m.enabled.mockResolvedValue(false);
    expect(await syncTicketRestauranteMonthlyBackup(input)).toBeNull();
    expect(m.getState).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('no guarda si no existe destino configurado', async () => {
    m.getState.mockReturnValue({ rutaExportacionTicketRestaurante: ' ' });
    expect(await syncTicketRestauranteMonthlyBackup(input)).toBeNull();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('traslada aviso de publicación sin confirmar éxito', async () => {
    m.save.mockResolvedValue('No se pudo guardar');
    expect(await syncTicketRestauranteMonthlyBackup(input)).toBe('No se pudo guardar');
  });
});
