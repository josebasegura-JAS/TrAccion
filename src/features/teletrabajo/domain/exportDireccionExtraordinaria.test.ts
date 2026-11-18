import { describe, expect, it, vi } from 'vitest';
import ExcelJS from 'exceljs';
import type { TeletrabajoSolicitud } from './solicitud';
import { exportTeletrabajoDireccionToExcel } from './exportDireccion';
import { buildTeletrabajoExtraordinariaDireccionReport } from './exportDireccionScope';

const capture = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('../../../shared/export/tableExport', () => ({
  buildStableExportFilename: () => 'teletrabajo-direccion.xlsx',
  openWorkbookInExcel: capture.save,
}));

function solicitud(id: string, estado: TeletrabajoSolicitud['estado'], modalidad: 'ordinaria'|'extraordinaria'): TeletrabajoSolicitud {
  return {
    id, empleado:id, nombreApellidos:'Persona '+id, puestoNomina:'Técnico',
    puestoOrganizativo:'', residencia:'', dni:'', direccionTeletrabajo:'',
    estado, tipoSolicitud:'nueva', modalidadTramitacion:modalidad,
    diasTeletrabajo:['miercoles'], fechaSolicitud:'2026-11-05',
    fechaOrdenador:'', fechaCascos:'', periodo:'2026-2027',
    observaciones:'', validacionSeguridadInformatica:false,
    validacionPrevencion:false, validacionJefatura:true,
    validacionDireccion:false, revisado:false,
    createdAt:'2026-11-01', updatedAt:'2026-11-01', deletedAt:null,
  };
}

describe('Excel Dirección · exportación extraordinaria con formato corporativo', () => {
  it('escribe extraordinarias al principio, aprobadas después y resumen al final', async () => {
    const approved = solicitud('1001','aprobada','ordinaria');
    const pending = solicitud('1008','pendiente','extraordinaria');
    const approvedExtra = solicitud('1009','aprobada','extraordinaria');
    const report = buildTeletrabajoExtraordinariaDireccionReport([approved,pending,approvedExtra]);
    capture.save.mockClear();
    await exportTeletrabajoDireccionToExcel({
      rows:report.rows, employees:[], puestosTeletrabajo:[],
      solicitudesForAssessment:[approved,pending,approvedExtra],
      periodo:'2026-2027',
      extraordinarySummary:{nuevasCount:report.nuevasCount,aprobadasCount:report.aprobadasCount},
    });
    expect(capture.save).toHaveBeenCalledOnce();
    const [buffer] = capture.save.mock.calls[0] as [Buffer, string];
    const workbook = new ExcelJS.Workbook();
    // ExcelJS espera Buffer<ArrayBuffer>; el exportador puede entregar
    // Buffer<ArrayBufferLike>. Copiamos los bytes a un ArrayBuffer propio.
    const exactBytes = new ArrayBuffer(buffer.byteLength);
    new Uint8Array(exactBytes).set(buffer);
    await workbook.xlsx.load(Buffer.from(exactBytes));
    const sheet = workbook.getWorksheet('Teletrabajo Dirección');
    expect(sheet).toBeDefined();
    if (!sheet) throw new Error('Falta hoja de Dirección');
    expect(sheet.getCell('B4').value).toBe('Solicitante');
    expect(sheet.getCell('B5').value).toBe('Nº Empl');
    expect(sheet.getCell('B6').value).toContain('NUEVAS SOLICITUDES EXTRAORDINARIAS');
    expect(sheet.getCell('B7').value).toBe(1008);
    expect(sheet.getCell('B8').value).toBe('SOLICITUDES APROBADAS VIGENTES');
    expect(sheet.getCell('B9').value).toBe(1001);
    expect(sheet.getCell('B10').value).toBe(1009);
    expect(sheet.getCell('B11').value).toBe('RESUMEN PARA DIRECCIÓN');
    expect(sheet.getCell('E12').value).toBe(2);
    expect(sheet.getCell('E13').value).toBe(1);
    expect(sheet.getCell('E14').value).toBe(3);
    // La misma cabecera roja y tipografía corporativa que el exportador actual.
    expect(sheet.getCell('B6').fill).toMatchObject({
      type:'pattern',fgColor:{argb:'FFFF0000'},
    });
    expect(sheet.getCell('B7').font.name).toBe('TrueRotisSemiSansLightTwo');
    expect(sheet.getColumn(27).width).toBe(17);
  });
});
