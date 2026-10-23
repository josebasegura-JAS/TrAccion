import { saveExcelBackupWithRetry } from '../../../shared/export/saveExcelBackupWithRetry';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import type { ActividadExterna } from '../domain/actividadExterna';

export async function syncActividadesExternasExcelBackup(records: ActividadExterna[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionActividadesExternas.trim();
  if (!directory) return 'Configura en Ajustes la carpeta del Excel espejo de Actividades Externas.';
  if (!window.traccion?.saveOperationalExcelBackup) return 'El Excel espejo solo está disponible en la aplicación de escritorio.';
  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAcción';
    const sheet = workbook.addWorksheet('Actividades Externas', {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' },
    });
    sheet.columns = [
      { header: 'Nº empleado', key: 'empleado', width: 17 },
      { header: 'Nombre y apellidos', key: 'nombre', width: 38 },
      { header: 'Actividad externa', key: 'actividad', width: 52 },
      { header: 'Fecha solicitud', key: 'fechaSolicitud', width: 19 },
      { header: 'Remunerada', key: 'remunerada', width: 16 },
      { header: 'Estado', key: 'estado', width: 18 },
      { header: 'Observaciones resolución', key: 'observaciones', width: 56 },
    ];
    const lastColumn = 'G';
    sheet.mergeCells('A1:G1');
    const title = sheet.getCell('A1');
    title.value = 'Actividades externas';
    title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 38;
    sheet.mergeCells('A2:G2');
    const info = sheet.getCell('A2');
    const generated = new Date().toLocaleDateString('es-ES');
    info.value = `Generado: ${generated}  |  Total: ${records.length}  |  Pendientes: ${records.filter((record) => record.estado === 'pendiente' || record.estado === 'propuesta').length}  |  Autorizadas: ${records.filter((record) => record.estado === 'autorizada').length}  |  Rechazadas/denegadas: ${records.filter((record) => record.estado === 'rechazada_rrll' || record.estado === 'denegada').length}`;
    info.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
    info.alignment = { vertical: 'middle' };
    sheet.getRow(2).height = 23;
    sheet.getRow(3).height = 10;
    sheet.getRow(4).values = ['Nº empleado', 'Nombre y apellidos', 'Actividad externa', 'Fecha solicitud', 'Remunerada', 'Estado', 'Observaciones resolución'];
    const safe = (value: string) => /^\s*[=+@-]/.test(value) ? `'${value}` : value;
    const sortedRecords = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const exportNotes = (record: ActividadExterna): string => {
      const rrll = (record.observacionesRrll ?? '').trim();
      const committee = (record.observacionesResolucion ?? '').trim();
      const legacyReason = (record.motivoDenegacion ?? '').trim();
      const lines: string[] = [];
      if (rrll) lines.push(`RRLL: ${rrll}`);
      if (committee) lines.push(`Comité: ${committee}`);
      if (!committee && legacyReason && !(rrll && record.estado === 'rechazada_rrll')) {
        lines.push(`${record.estado === 'rechazada_rrll' ? 'RRLL' : 'Comité'}: ${legacyReason}`);
      }
      return lines.join('\n');
    };
    sortedRecords.forEach((record) => {
      sheet.addRow({
        empleado: safe(record.empleado),
        nombre: safe(record.nombre),
        actividad: safe(record.actividad),
        fechaSolicitud: record.fechaSolicitud,
        remunerada: record.remunerada ? 'Sí' : 'No',
        estado: ({ pendiente: 'Pendiente de RRLL', propuesta: 'Pendiente de Comité', rechazada_rrll: 'Rechazada por RRLL', autorizada: 'Autorizada', denegada: 'Denegada' } as const)[record.estado],
        observaciones: safe(exportNotes(record)),
      });
    });
    sheet.properties.defaultRowHeight = 22;
    sheet.pageSetup.margins = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    const header = sheet.getRow(4);
    header.height = 31;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true, horizontal: 'left', indent: 1 };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF991B1B' } } };
    });
    sheet.autoFilter = { from: 'A4', to: `${lastColumn}4` };
    sheet.eachRow((row, index) => {
      if (index <= 4) return;
      const record = sortedRecords[index - 5];
      const denied = record?.estado === 'denegada' || record?.estado === 'rechazada_rrll';
      const background = denied ? 'FFFEE2E2' : index % 2 === 0 ? 'FFF3F4F6' : 'FFFFFFFF';
      row.height = 32;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: background } };
        cell.font = { name: 'Calibri', size: 11, color: { argb: denied ? 'FF991B1B' : 'FF1F2937' }, bold: false };
        cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
      if (denied) {
        row.getCell(6).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFB91C1C' } };
      }
    });
    sheet.pageSetup.horizontalCentered = true;
    sheet.pageSetup.printArea = `A1:G${Math.max(4, sheet.rowCount)}`;
    const raw = await workbook.xlsx.writeBuffer();
    const buffer = raw instanceof ArrayBuffer
      ? raw
      : new Uint8Array(raw).slice().buffer as ArrayBuffer;
    const result = await saveExcelBackupWithRetry({
      directory, fileName: 'Actividades_Externas.xlsx',
      cleanupPrefix: 'Actividades_Externas', buffer,
    });
    return result;
  } catch (error) {
    return `No se pudo actualizar el Excel espejo: ${error instanceof Error ? error.message : String(error)}`;
  }
}
