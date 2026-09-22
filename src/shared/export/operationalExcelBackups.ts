import type ExcelJS from 'exceljs';
import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type { LicenciaSinSueldoRecord } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';
import { getEffectiveLicenciaEstado } from '../../features/licencias-sin-sueldo/domain/licenciaSinSueldo';
import type { Vinculograma } from '../../features/vinculograma/domain/vinculograma';
import { getVinculogramaStatus } from '../../features/vinculograma/domain/vinculograma';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const COLORS = {
  navy: '17365D',
  red: 'D7193F',
  lightBlue: 'DDEBF7',
  paleBlue: 'EAF2F8',
  green: 'E2F0D9',
  greenText: '375623',
  amber: 'FFF2CC',
  amberText: '7F6000',
  redSoft: 'FCE4D6',
  redText: '9C0006',
  grey: 'E7E6E6',
  greyText: '595959',
  white: 'FFFFFF',
  border: 'D9E1F2',
  text: '1F2937',
  muted: '64748B',
};

function workbookBufferToArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function fileDate(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
}

function todayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseExcelDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(result.getTime()) ? null : result;
}

function parseExcelDateTime(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function humanizeLicenciaEstado(value: string): string {
  const labels: Record<string, string> = {
    pendiente_aprobacion: 'Pendiente de aprobación',
    pendiente_firma: 'Pendiente de firma',
    vigente: 'Vigente',
    denegada: 'Denegada',
    historico: 'Histórico',
  };
  return labels[value] ?? value;
}

function applyThinBorder(cell: ExcelJS.Cell): void {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: `FF${COLORS.border}` } };
  cell.border = { top: side, left: side, bottom: side, right: side };
}

function addTitleBlock(
  worksheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  lastColumn: number,
): void {
  worksheet.mergeCells(1, 1, 1, lastColumn);
  const brand = worksheet.getCell(1, 1);
  brand.value = 'TRACCION · RELACIONES LABORALES';
  brand.font = { bold: true, size: 10, color: { argb: `FF${COLORS.red}` } };
  brand.alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 18;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  const heading = worksheet.getCell(2, 1);
  heading.value = title;
  heading.font = { bold: true, size: 18, color: { argb: `FF${COLORS.navy}` } };
  heading.alignment = { vertical: 'middle' };
  worksheet.getRow(2).height = 28;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  const subheading = worksheet.getCell(3, 1);
  subheading.value = subtitle;
  subheading.font = { size: 9, color: { argb: `FF${COLORS.muted}` } };
  subheading.alignment = { vertical: 'middle' };
  worksheet.getRow(3).height = 18;
}

function styleTableHeader(row: ExcelJS.Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${COLORS.navy}` } };
    cell.font = { bold: true, color: { argb: `FF${COLORS.white}` }, size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    applyThinBorder(cell);
  });
}

function styleDataRows(worksheet: ExcelJS.Worksheet, firstRow: number, lastRow: number): void {
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = 22;
    row.eachCell((cell) => {
      cell.font = { size: 9, color: { argb: `FF${COLORS.text}` } };
      applyThinBorder(cell);
    });
  }
}

function styleStatusCell(cell: ExcelJS.Cell, status: string): void {
  const normalized = status.toLowerCase();
  let fill = COLORS.grey;
  let font = COLORS.greyText;
  if (normalized.includes('vigente')) {
    fill = COLORS.green;
    font = COLORS.greenText;
  } else if (normalized.includes('pendiente')) {
    fill = COLORS.amber;
    font = COLORS.amberText;
  } else if (normalized.includes('denegada') || normalized.includes('vencido') || normalized.includes('revocado')) {
    fill = COLORS.redSoft;
    font = COLORS.redText;
  }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
  cell.font = { bold: true, size: 9, color: { argb: `FF${font}` } };
}

function addKpi(
  worksheet: ExcelJS.Worksheet,
  row: number,
  column: number,
  label: string,
  value: string | number,
  fill = COLORS.paleBlue,
): void {
  const valueCell = worksheet.getCell(row, column);
  const labelCell = worksheet.getCell(row + 1, column);
  valueCell.value = value;
  valueCell.font = { bold: true, size: 16, color: { argb: `FF${COLORS.navy}` } };
  valueCell.alignment = { horizontal: 'center', vertical: 'middle' };
  valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
  labelCell.value = label;
  labelCell.font = { bold: true, size: 9, color: { argb: `FF${COLORS.muted}` } };
  labelCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${fill}` } };
  applyThinBorder(valueCell);
  applyThinBorder(labelCell);
}

function applySummaryPrint(worksheet: ExcelJS.Worksheet): void {
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

function applyDataPrint(worksheet: ExcelJS.Worksheet): void {
  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}

async function saveWorkbook(
  directory: string,
  fileName: string,
  cleanupPrefix: string,
  buffer: ArrayBuffer,
): Promise<string | null> {
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;
  const result = await window.traccion.saveOperationalExcelBackup({
    directory: directory.trim(),
    fileName,
    cleanupPrefix,
    buffer,
  });
  return result.ok ? null : result.message;
}

export function appendBackupMessage(baseMessage: string, backupMessage: string | null): string {
  return backupMessage ? `${baseMessage} ${backupMessage}` : baseMessage;
}

export async function syncLicenciasExcelBackup(records: LicenciaSinSueldoRecord[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionLicencias;
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;

  try {
    const { default: ExcelJSRuntime } = await import('exceljs');
    const workbook = new ExcelJSRuntime.Workbook();
    workbook.creator = 'TrAccion';
    workbook.subject = 'Excel espejo automático de Licencias sin sueldo y Excedencias';
    workbook.created = new Date();
    workbook.modified = new Date();

    const visible = records.filter((record) => !record.deletedAt);
    const today = todayIso();
    const stateCounts = new Map<string, number>();
    const typeCounts = new Map<string, number>();
    visible.forEach((record) => {
      const state = humanizeLicenciaEstado(getEffectiveLicenciaEstado(record, today));
      stateCounts.set(state, (stateCounts.get(state) ?? 0) + 1);
      typeCounts.set(record.tipo, (typeCounts.get(record.tipo) ?? 0) + 1);
    });

    const summary = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
    addTitleBlock(summary, 'Licencias sin sueldo y Excedencias', `Actualizado ${new Date().toLocaleString('es-ES')} · ${visible.length} registros`, 6);
    for (let column = 1; column <= 6; column += 1) summary.getColumn(column).width = 20;
    addKpi(summary, 5, 1, 'Total registros', visible.length);
    addKpi(summary, 5, 2, 'Pend. aprobación', stateCounts.get('Pendiente de aprobación') ?? 0, COLORS.amber);
    addKpi(summary, 5, 3, 'Pend. firma', stateCounts.get('Pendiente de firma') ?? 0, COLORS.amber);
    addKpi(summary, 5, 4, 'Vigentes', stateCounts.get('Vigente') ?? 0, COLORS.green);
    addKpi(summary, 5, 5, 'Denegadas', stateCounts.get('Denegada') ?? 0, COLORS.redSoft);
    addKpi(summary, 5, 6, 'Histórico', stateCounts.get('Histórico') ?? 0, COLORS.grey);

    summary.getCell('A9').value = 'Distribución por tipo';
    summary.getCell('A9').font = { bold: true, size: 12, color: { argb: `FF${COLORS.navy}` } };
    summary.getCell('A10').value = 'Tipo';
    summary.getCell('B10').value = 'Cantidad';
    styleTableHeader(summary.getRow(10));
    let summaryRow = 11;
    for (const [type, count] of [...typeCounts.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))) {
      summary.getCell(summaryRow, 1).value = type;
      summary.getCell(summaryRow, 2).value = count;
      summaryRow += 1;
    }
    if (summaryRow > 11) styleDataRows(summary, 11, summaryRow - 1);
    applySummaryPrint(summary);

    const data = workbook.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 5 }] });
    addTitleBlock(data, 'Detalle de licencias y excedencias', `Actualizado ${new Date().toLocaleString('es-ES')}`, 13);
    const headers = [
      'Nº empleado', 'Nombre y apellidos', 'Tipo', 'Fecha solicitud', 'Fecha inicio', 'Fecha fin',
      'Prórroga inicio', 'Prórroga fin', 'Fecha fin efectiva', 'Estado', 'Observaciones', 'Actualizaciones', 'Última actualización',
    ];
    headers.forEach((header, index) => { data.getCell(5, index + 1).value = header; });
    styleTableHeader(data.getRow(5));
    data.autoFilter = { from: 'A5', to: 'M5' };
    data.columns = [
      { width: 15 }, { width: 34 }, { width: 28 }, { width: 16 }, { width: 14 }, { width: 14 },
      { width: 16 }, { width: 16 }, { width: 18 }, { width: 24 }, { width: 42 }, { width: 60 }, { width: 22 },
    ];

    visible.forEach((record, index) => {
      const rowNumber = 6 + index;
      const effectiveState = humanizeLicenciaEstado(getEffectiveLicenciaEstado(record, today));
      const values: Array<string | number | Date | null> = [
        record.numeroEmpleado,
        record.nombreCompleto,
        record.tipo,
        parseExcelDate(record.fechaSolicitud),
        parseExcelDate(record.fechaInicio),
        parseExcelDate(record.fechaFin),
        parseExcelDate(record.prorroga?.fechaInicio ?? ''),
        parseExcelDate(record.prorroga?.fechaFin ?? ''),
        parseExcelDate(record.prorroga?.fechaFin || record.fechaFin),
        effectiveState,
        record.observaciones,
        record.actualizaciones.map((item) => `${item.fecha}: ${item.texto}`).join('\n'),
        parseExcelDateTime(record.updatedAt),
      ];
      values.forEach((value, columnIndex) => { data.getCell(rowNumber, columnIndex + 1).value = value; });
      [4, 5, 6, 7, 8, 9].forEach((column) => { data.getCell(rowNumber, column).numFmt = 'dd/mm/yyyy'; });
      data.getCell(rowNumber, 13).numFmt = 'dd/mm/yyyy hh:mm';
      styleStatusCell(data.getCell(rowNumber, 10), effectiveState);
    });
    if (visible.length > 0) styleDataRows(data, 6, 5 + visible.length);
    // Reapply status styling because generic row styling sets the default font.
    visible.forEach((record, index) => styleStatusCell(data.getCell(6 + index, 10), humanizeLicenciaEstado(getEffectiveLicenciaEstado(record, today))));
    data.getColumn(12).alignment = { vertical: 'top', wrapText: true };
    applyDataPrint(data);

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = workbookBufferToArrayBuffer(raw as ArrayBuffer | Uint8Array);
    return await saveWorkbook(directory, `Licencias_y_Excedencias_${fileDate()}.xlsx`, 'Licencias_y_Excedencias_', buffer);
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático de Licencias: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export async function syncVinculogramaExcelBackup(records: Vinculograma[]): Promise<string | null> {
  const directory = useConfiguracionStore.getState().rutaExportacionVinculograma;
  if (!directory.trim() || !window.traccion?.saveOperationalExcelBackup) return null;

  try {
    const { default: ExcelJSRuntime } = await import('exceljs');
    const workbook = new ExcelJSRuntime.Workbook();
    workbook.creator = 'TrAccion';
    workbook.subject = 'Excel espejo automático de Vinculograma';
    workbook.created = new Date();
    workbook.modified = new Date();

    const visible = records.filter((record) => !record.deletedAt);
    const today = todayIso();
    const counts = new Map<string, number>();
    visible.forEach((record) => {
      const status = getVinculogramaStatus(record.expiryDate, today, record.revokedAt);
      counts.set(status, (counts.get(status) ?? 0) + 1);
    });

    const summary = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 4 }] });
    addTitleBlock(summary, 'Vinculograma', `Actualizado ${new Date().toLocaleString('es-ES')} · ${visible.length} registros`, 4);
    for (let column = 1; column <= 4; column += 1) summary.getColumn(column).width = 23;
    addKpi(summary, 5, 1, 'Total registros', visible.length);
    addKpi(summary, 5, 2, 'Vigentes', counts.get('Vigente') ?? 0, COLORS.green);
    addKpi(summary, 5, 3, 'Vencidos', counts.get('Vencido') ?? 0, COLORS.redSoft);
    addKpi(summary, 5, 4, 'Revocados', counts.get('Revocado') ?? 0, COLORS.grey);
    summary.getCell('A9').value = 'Lectura rápida';
    summary.getCell('A9').font = { bold: true, size: 12, color: { argb: `FF${COLORS.navy}` } };
    summary.mergeCells('A10:D11');
    summary.getCell('A10').value = 'El detalle mantiene fechas Excel reales, filtros y señalización por estado para facilitar ordenación, revisión e impresión.';
    summary.getCell('A10').alignment = { wrapText: true, vertical: 'top' };
    summary.getCell('A10').font = { size: 10, color: { argb: `FF${COLORS.muted}` } };
    applySummaryPrint(summary);

    const data = workbook.addWorksheet('Datos', { views: [{ state: 'frozen', ySplit: 5 }] });
    addTitleBlock(data, 'Detalle de Vinculograma', `Actualizado ${new Date().toLocaleString('es-ES')}`, 9);
    const headers = ['Nº empleado', 'Nombre y apellidos', 'Persona vinculada', 'Fecha solicitud', 'Fecha vencimiento', 'Estado', 'Fecha revocación', 'Motivo revocación', 'Última actualización'];
    headers.forEach((header, index) => { data.getCell(5, index + 1).value = header; });
    styleTableHeader(data.getRow(5));
    data.autoFilter = { from: 'A5', to: 'I5' };
    data.columns = [
      { width: 15 }, { width: 34 }, { width: 34 }, { width: 16 }, { width: 18 }, { width: 14 }, { width: 17 }, { width: 42 }, { width: 22 },
    ];

    visible.forEach((record, index) => {
      const rowNumber = 6 + index;
      const status = getVinculogramaStatus(record.expiryDate, today, record.revokedAt);
      const values: Array<string | number | Date | null> = [
        record.employeeNumber,
        record.nombreCompleto,
        record.linkedPerson,
        parseExcelDate(record.requestDate),
        parseExcelDate(record.expiryDate),
        status,
        parseExcelDate(record.revokedAt),
        record.revocationReason,
        parseExcelDateTime(record.updatedAt),
      ];
      values.forEach((value, columnIndex) => { data.getCell(rowNumber, columnIndex + 1).value = value; });
      [4, 5, 7].forEach((column) => { data.getCell(rowNumber, column).numFmt = 'dd/mm/yyyy'; });
      data.getCell(rowNumber, 9).numFmt = 'dd/mm/yyyy hh:mm';
      styleStatusCell(data.getCell(rowNumber, 6), status);
    });
    if (visible.length > 0) styleDataRows(data, 6, 5 + visible.length);
    visible.forEach((record, index) => styleStatusCell(data.getCell(6 + index, 6), getVinculogramaStatus(record.expiryDate, today, record.revokedAt)));
    applyDataPrint(data);

    const raw = await workbook.xlsx.writeBuffer();
    const buffer = workbookBufferToArrayBuffer(raw as ArrayBuffer | Uint8Array);
    return await saveWorkbook(directory, `Vinculograma_${fileDate()}.xlsx`, 'Vinculograma_', buffer);
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel automático de Vinculograma: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export const OPERATIONAL_BACKUP_MIME = MIME;
