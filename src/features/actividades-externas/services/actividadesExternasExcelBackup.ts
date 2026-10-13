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
    });
    sheet.columns = [
      { header: 'Nº empleado', key: 'empleado', width: 17 },
      { header: 'Nombre y apellidos', key: 'nombre', width: 38 },
      { header: 'Actividad externa', key: 'actividad', width: 52 },
      { header: 'Fecha solicitud', key: 'fechaSolicitud', width: 19 },
      { header: 'Remunerada', key: 'remunerada', width: 16 },
      { header: 'Estado', key: 'estado', width: 18 },
      { header: 'Observaciones resolución', key: 'observaciones', width: 56 },
      { header: 'Fecha resolución', key: 'fechaResolucion', width: 24 },
      { header: 'Comunicación', key: 'comunicacion', width: 20 },
      { header: 'Fecha comunicación', key: 'fechaComunicacion', width: 24 },
      { header: 'Correo', key: 'email', width: 38 },
    ];
    const lastColumn = 'K';
    sheet.mergeCells('A1:K1');
    const title = sheet.getCell('A1');
    title.value = 'Actividades externas';
    title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 38;
    sheet.mergeCells('A2:K2');
    const info = sheet.getCell('A2');
    const generated = new Date().toLocaleDateString('es-ES');
    info.value = `Generado: ${generated} · Total solicitudes: ${records.length} · Pendientes: ${records.filter((record) => record.estado === 'pendiente').length} · Autorizadas: ${records.filter((record) => record.estado === 'autorizada').length} · Denegadas: ${records.filter((record) => record.estado === 'denegada').length}`;
    info.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
    info.alignment = { vertical: 'middle' };
    sheet.getRow(2).height = 23;
    sheet.getRow(3).height = 10;
    sheet.getRow(4).values = ['Nº empleado', 'Nombre y apellidos', 'Actividad externa', 'Fecha solicitud', 'Remunerada', 'Estado', 'Observaciones resolución', 'Fecha resolución', 'Comunicación', 'Fecha comunicación', 'Correo'];
    const safe = (value: string) => /^\s*[=+@-]/.test(value) ? `'${value}` : value;
    [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach((record) => {
      sheet.addRow({
        empleado: safe(record.empleado),
        nombre: safe(record.nombre),
        actividad: safe(record.actividad),
        fechaSolicitud: record.fechaSolicitud,
        remunerada: record.remunerada ? 'Sí' : 'No',
        estado: record.estado === 'autorizada' ? 'Autorizada' : record.estado === 'denegada' ? 'Denegada' : 'Pendiente',
        observaciones: safe(record.observacionesResolucion || record.motivoDenegacion || ''),
        fechaResolucion: record.fechaResolucion || '',
        comunicacion: record.comunicacion,
        fechaComunicacion: record.fechaComunicacion || '',
        email: safe(record.email),
      });
    });
    const header = sheet.getRow(4);
    header.height = 31;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    sheet.autoFilter = { from: 'A4', to: `${lastColumn}4` };
    sheet.eachRow((row, index) => {
      if (index <= 4) return;
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = 22;
      row.font = { name: 'Calibri', size: 11, color: { argb: 'FF111827' } };
      if (index % 2 === 0) row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      });
    });
    const raw = await workbook.xlsx.writeBuffer();
    const buffer = raw instanceof ArrayBuffer
      ? raw
      : new Uint8Array(raw).slice().buffer as ArrayBuffer;
    const result = await window.traccion.saveOperationalExcelBackup({
      directory, fileName: 'Actividades_Externas.xlsx',
      cleanupPrefix: 'Actividades_Externas', buffer,
    });
    return result.ok ? null : `No se pudo actualizar el Excel espejo: ${result.message}`;
  } catch (error) {
    return `No se pudo actualizar el Excel espejo: ${error instanceof Error ? error.message : String(error)}`;
  }
}
