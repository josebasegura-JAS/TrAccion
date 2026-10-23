import { saveExcelBackupWithRetry } from '../../../shared/export/saveExcelBackupWithRetry';
import { useConfiguracionStore } from '../../configuracion/store/useConfiguracionStore';
import type { CriterioRrll } from '../domain/criterioRrll';

export async function syncCriteriosRrllExcelBackup(records: CriterioRrll[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionCriteriosRrll.trim();
  if (!directory) return 'Configura en Ajustes la carpeta del Excel espejo de Criterios RRLL.';
  if (!window.traccion?.saveOperationalExcelBackup) return 'El Excel espejo solo está disponible en la aplicación de escritorio.';
  try {
    const { default: ExcelJS } = await import('exceljs');
    const active = records.filter((record) => !record.deletedAt).sort((a, b) => a.tema.localeCompare(b.tema, 'es'));
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAcción';
    const sheet = workbook.addWorksheet('Criterios RRLL', {
      views: [{ state: 'frozen', ySplit: 4 }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:4' },
    });
    sheet.columns = [
      { header: 'Tema', key: 'tema', width: 40 },
      { header: 'Estado', key: 'estado', width: 19 },
      { header: 'Sentido', key: 'sentido', width: 19 },
      { header: 'Fecha', key: 'fecha', width: 16 },
      { header: 'Responsable', key: 'responsable', width: 25 },
      { header: 'Criterio', key: 'criterio', width: 75 },
      { header: 'Observaciones', key: 'observaciones', width: 65 },
    ];
    sheet.mergeCells('A1:G1');
    const title = sheet.getCell('A1');
    title.value = 'CRITERIOS RRLL';
    title.font = { name: 'Calibri', bold: true, size: 17, color: { argb: 'FFFFFFFF' } };
    title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
    title.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 38;
    sheet.mergeCells('A2:G2');
    const info = sheet.getCell('A2');
    info.value = `Generado: ${new Date().toLocaleDateString('es-ES')}  |  Total: ${active.length}  |  Vigentes: ${active.filter((r) => r.estado === 'vigente').length}  |  En revisión: ${active.filter((r) => r.estado === 'en revisión').length}  |  Archivados: ${active.filter((r) => r.estado === 'archivado').length}`;
    info.font = { name: 'Calibri', size: 10, color: { argb: 'FF64748B' } };
    sheet.getRow(2).height = 24;
    sheet.getRow(3).height = 10;
    const labels = ['Tema', 'Estado', 'Sentido', 'Fecha', 'Responsable', 'Criterio', 'Observaciones'];
    sheet.getRow(4).values = labels;
    const header = sheet.getRow(4);
    header.height = 30;
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
      cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { wrapText: true, vertical: 'middle', indent: 1 };
    });
    // Excel nunca debe interpretar texto introducido por usuarios como fórmula.
    const safe = (value: string) => /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    active.forEach((record, index) => {
      const row = sheet.addRow({
        tema: safe(record.tema), estado: record.estado, sentido: record.sentido,
        fecha: safe(record.fecha), responsable: safe(record.responsable),
        criterio: safe(record.criterio), observaciones: safe(record.observaciones),
      });
      const denied = record.sentido === 'denegado';
      const background = denied ? 'FFFEE2E2' : index % 2 === 0 ? 'FFFFFFFF' : 'FFF3F4F6';
      row.height = 46;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: background } };
        cell.font = { name: 'Calibri', size: 10, color: { argb: denied ? 'FF991B1B' : 'FF1F2937' } };
        cell.alignment = { vertical: 'middle', wrapText: true, indent: 1 };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    });
    sheet.autoFilter = { from: 'A4', to: 'G4' };
    sheet.pageSetup.printArea = `A1:G${Math.max(4, sheet.rowCount)}`;
    const raw = await workbook.xlsx.writeBuffer();
    const buffer = raw instanceof ArrayBuffer ? raw : new Uint8Array(raw).slice().buffer as ArrayBuffer;
    return await saveExcelBackupWithRetry({
      directory, fileName: 'Criterios_RRLL.xlsx', cleanupPrefix: 'Criterios_RRLL', buffer,
    });
  } catch (error) {
    return `No se pudo actualizar el Excel espejo de Criterios RRLL: ${error instanceof Error ? error.message : String(error)}`;
  }
}
