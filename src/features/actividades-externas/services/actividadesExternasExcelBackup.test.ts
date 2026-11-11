import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import type { ActividadExterna } from '../domain/actividadExterna';
import { syncActividadesExternasExcelBackup } from './actividadesExternasExcelBackup';

function record(
  id: string, estado: ActividadExterna['estado'],
  overrides: Partial<ActividadExterna> = {},
): ActividadExterna {
  return {
    id,
    empleado: id,
    nombre: 'Persona de prueba',
    email: '',
    actividad: 'Docencia',
    fechaSolicitud: '2026-11-11',
    remunerada: true,
    estado,
    motivoDenegacion: '',
    observacionesResolucion: '',
    fechaResolucion: null,
    observacionesRrll: '',
    comunicacion: 'pendiente',
    fechaComunicacion: null,
    createdAt: '2026-11-11T08:00:00.000Z',
    updatedAt: '2026-11-11T08:00:00.000Z',
    ...overrides,
  };
}

describe('Excel espejo de Actividades Externas: formato de referencia', () => {
  const originalTraccion = window.traccion;

  beforeEach(() => {
    useConfiguracionStore.setState({ rutaExportacionActividadesExternas: 'G:\\RRLL\\Actividades' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'traccion', { configurable: true, value: originalTraccion });
  });

  it('respeta siete columnas, filtros, estados coloreados, fechas Excel y observaciones largas', async () => {
    let payload: { fileName: string; buffer: ArrayBuffer } | undefined;
    Object.defineProperty(window, 'traccion', {
      configurable: true,
      value: {
        saveOperationalExcelBackup: vi.fn(async (item) => {
          payload = item;
          return { ok: true, message: 'Guardado', path: item.fileName };
        }),
      },
    });
    const records = [
      record('100', 'propuesta', {
        actividad: 'Actividades complementarias de formación y docencia prolongadas durante varios periodos',
        observacionesRrll: 'Descripción extensa para demostrar que el texto se ajusta correctamente al ancho de la celda sin quedar oculto. '.repeat(3),
        createdAt: '2026-11-11T11:00:00.000Z',
      }),
      record('101', 'autorizada', { createdAt: '2026-11-11T10:00:00.000Z' }),
      record('102', 'denegada', { motivoDenegacion: 'Incompatible', createdAt: '2026-11-11T09:00:00.000Z' }),
      record('103', 'pendiente', { fechaSolicitud: 'Fecha pendiente', createdAt: '2026-11-11T08:00:00.000Z' }),
    ];
    expect(await syncActividadesExternasExcelBackup(records)).toBeNull();
    expect(payload?.fileName).toBe('Actividades_Externas.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(new Uint8Array(payload!.buffer)) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet('Actividades Externas');
    expect(sheet).toBeDefined();
    expect(sheet!.getCell('A1').value).toBe('Actividades externas');
    expect(sheet!.autoFilter).toEqual({ from: 'A4', to: 'G4' });
    expect(String(sheet!.getCell('A2').value)).toContain('Total: 4');
    expect(sheet!.getCell('D5').value).toBeInstanceOf(Date);
    expect(sheet!.getCell('D5').numFmt).toBe('yyyy-mm-dd');
    expect(sheet!.getCell('D8').value).toBe('Fecha pendiente');
    expect(sheet!.getCell('F5').value).toBe('Pendiente de Comité');
    expect(sheet!.getCell('F5').fill).toMatchObject({ fgColor: { argb: 'FFFCE4D6' } });
    expect(sheet!.getCell('F6').fill).toMatchObject({ fgColor: { argb: 'FFEAF2DD' } });
    expect(sheet!.getCell('F7').fill).toMatchObject({ fgColor: { argb: 'FFFEE2E2' } });
    expect(sheet!.getCell('F8').fill).toMatchObject({ fgColor: { argb: 'FFFCE4D6' } });
    expect(sheet!.getCell('B5').fill).toMatchObject({ fgColor: { argb: 'FFFFFFFF' } });
    expect(sheet!.getCell('B6').fill).toMatchObject({ fgColor: { argb: 'FFF3F4F6' } });
    expect(sheet!.getRow(5).height).toBeGreaterThan(32);
    expect(sheet!.getCell('G5').value).toContain('RRLL: Descripción extensa');
    expect(sheet!.getRow(5).height).toBeLessThanOrEqual(210);
    expect(sheet!.getCell('G7').value).toBe('Comité: Incompatible');
    expect(sheet!.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
  });
});
