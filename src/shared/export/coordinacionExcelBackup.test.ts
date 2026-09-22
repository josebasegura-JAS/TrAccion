import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type { CoordinationMeeting } from '../../features/coordinacion/domain/coordinacion';
import { syncCoordinacionExcelBackup } from './coordinacionExcelBackup';

function meeting(
  id: string,
  area: CoordinationMeeting['area'],
  context: string,
  dueDate = '',
): CoordinationMeeting {
  return {
    id,
    area,
    areaName: area === 'otras-areas' ? context : undefined,
    unionName: area === 'sindicatos' ? context : undefined,
    meetingType: area === 'sindicatos' ? 'seguimiento' : undefined,
    interlocutors: 'Representación y RRLL',
    purpose: 'Seguimiento operativo',
    date: '2026-09-22',
    status: 'open',
    points: [{
      id: `${id}-point`,
      origin: 'manual',
      taskId: null,
      title: `Asunto ${context}`,
      detail: 'Detalle del asunto',
      result: 'Pendiente de respuesta',
      status: area === 'sindicatos' ? 'pendiente-sindicato' : 'pendiente',
      responsible: area === 'sindicatos' ? 'RRLL' : '',
      dueDate,
      createdAt: '2026-09-22T08:00:00.000Z',
      updatedAt: '2026-09-22T08:00:00.000Z',
    }],
    createdAt: '2026-09-22T08:00:00.000Z',
    updatedAt: '2026-09-22T08:00:00.000Z',
    closedAt: null,
  };
}

describe('backup Excel de Coordinación', () => {
  const originalTraccion = window.traccion;

  beforeEach(() => {
    useConfiguracionStore.setState({ rutaExportacionCoordinacion: 'G:\\RRLL\\Coordinacion\\{year}' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'traccion', { configurable: true, value: originalTraccion });
  });

  it('genera un único fichero profesional para cada ámbito en la misma carpeta', async () => {
    const saved: Array<{ directory: string; fileName: string; cleanupPrefix: string; buffer: ArrayBuffer }> = [];
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        saveOperationalExcelBackup: vi.fn(async (payload) => {
          saved.push(payload);
          return { ok: true, message: 'Guardado', path: `${payload.directory}\\${payload.fileName}` };
        }),
      },
    });

    const result = await syncCoordinacionExcelBackup([
      meeting('dir-1', 'direccion', 'Dirección'),
      meeting('area-1', 'otras-areas', 'Operaciones'),
      meeting('union-1', 'sindicatos', 'Sindicato A', '2026-09-01'),
    ]);

    expect(result).toBeNull();
    expect(saved.map((item) => item.fileName)).toEqual([
      'Coordinacion_Direccion.xlsx',
      'Coordinacion_Otras_Areas.xlsx',
      'Coordinacion_Sindicatos.xlsx',
    ]);
    expect(new Set(saved.map((item) => item.directory))).toEqual(new Set(['G:\\RRLL\\Coordinacion\\2026']));
    expect(saved.map((item) => item.cleanupPrefix)).toEqual([
      'Coordinacion_Direccion',
      'Coordinacion_Otras_Areas',
      'Coordinacion_Sindicatos',
    ]);

    const directionWorkbook = new ExcelJS.Workbook();
    await directionWorkbook.xlsx.load(Buffer.from(new Uint8Array(saved[0].buffer)));
    expect(directionWorkbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Histórico', 'Pendientes']);
    expect(String(directionWorkbook.getWorksheet('Resumen')?.getCell('A1').value)).toContain('COORDINACIÓN DIRECCIÓN');
    expect(String(directionWorkbook.getWorksheet('Resumen')?.getCell('F2').value)).toContain('Actualizado:');

    const unionWorkbook = new ExcelJS.Workbook();
    await unionWorkbook.xlsx.load(Buffer.from(new Uint8Array(saved[2].buffer)));
    expect(unionWorkbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Histórico', 'Pendientes', 'Compromisos']);
    expect(unionWorkbook.getWorksheet('Compromisos')?.getCell('G5').value).toBe('Vencido');
  });
});
