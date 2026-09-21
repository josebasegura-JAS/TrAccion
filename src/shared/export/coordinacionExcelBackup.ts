import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type { CoordinationMeeting, CoordinationPoint, CoordinationPointStatus } from '../../features/coordinacion/domain/coordinacion';
import { formatCoordinationDate } from '../../features/coordinacion/domain/coordinacion';
import { coordinationPointStatusLabel } from '../../features/coordinacion/store/useCoordinacionStore';

function toArrayBuffer(buffer: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) return buffer;
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function resolveDirectory(template: string, year: number): string {
  return template.split('{year}').join(String(year)).trim();
}

type ExcelCell = {
  value?: unknown;
  font?: Record<string, unknown>;
  fill?: Record<string, unknown>;
  border?: Record<string, unknown>;
  alignment?: Record<string, unknown>;
  numFmt?: string;
};

type ExcelWorksheet = {
  properties: Record<string, unknown>;
  views: Record<string, unknown>[];
  columns: Array<{ header?: string; key?: string; width?: number }>;
  addRow: (values: Record<string, unknown> | unknown[]) => { eachCell: (callback: (cell: ExcelCell, colNumber: number) => void) => void; getCell: (index: number) => ExcelCell };
  getRow: (rowNumber: number) => { height?: number; font?: Record<string, unknown>; eachCell: (callback: (cell: ExcelCell, colNumber: number) => void) => void };
  getCell: (address: string) => ExcelCell;
  mergeCells: (range: string) => void;
  addTable?: (table: Record<string, unknown>) => void;
  autoFilter?: string | { from: string; to: string };
  pageSetup?: Record<string, unknown>;
  headerFooter?: Record<string, unknown>;
  state?: string;
};

type ExcelWorkbook = {
  creator?: string;
  subject?: string;
  created?: Date;
  modified?: Date;
  addWorksheet: (name: string, options?: Record<string, unknown>) => ExcelWorksheet;
  xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> };
};

const COLORS = {
  burgundy: '8A1538',
  burgundySoft: 'F7EDF1',
  navy: '314A67',
  navySoft: 'ECF2F8',
  amber: 'D17A0F',
  amberSoft: 'FDF3E7',
  purple: '6E5A95',
  purpleSoft: 'F3EFFA',
  green: '2E8B57',
  greenSoft: 'EAF7F0',
  slate: '6B7280',
  text: '253248',
  muted: '7B8794',
  border: 'D7DEE8',
  headerBg: '415974',
  white: 'FFFFFF',
  light: 'F8FAFC',
  noteBg: 'F5F7FA',
  orangeText: 'B85C00',
  blueText: '2563EB',
  purpleText: '6D28D9',
};

function applyBorder(cell: ExcelCell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: COLORS.border } },
    left: { style: 'thin', color: { argb: COLORS.border } },
    bottom: { style: 'thin', color: { argb: COLORS.border } },
    right: { style: 'thin', color: { argb: COLORS.border } },
  };
}

function setMergedBlock(
  sheet: ExcelWorksheet,
  range: string,
  value: string | number,
  options: {
    fill: string;
    fontColor?: string;
    bold?: boolean;
    size?: number;
    horizontal?: 'left' | 'center' | 'right';
    vertical?: 'top' | 'middle' | 'bottom';
    wrapText?: boolean;
  },
): void {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: options.fill } };
  cell.font = {
    bold: options.bold ?? true,
    size: options.size ?? 12,
    color: { argb: options.fontColor ?? COLORS.text },
    name: 'Calibri',
  };
  cell.alignment = {
    horizontal: options.horizontal ?? 'left',
    vertical: options.vertical ?? 'middle',
    wrapText: options.wrapText ?? true,
  };
  applyBorder(cell);
}

function statusFill(status: CoordinationPointStatus): { fill: string; text: string } {
  if (status === 'tratado') return { fill: 'DBEAFE', text: COLORS.blueText };
  if (status === 'volver') return { fill: 'EDE9FE', text: COLORS.purpleText };
  return { fill: 'FEF3C7', text: COLORS.orangeText };
}

function getMeetingStateLabel(status: CoordinationMeeting['status']): string {
  return status === 'closed' ? 'Cerrada' : 'Abierta';
}

function collectStats(meetings: CoordinationMeeting[]) {
  const points = meetings.flatMap((meeting) => meeting.points);
  return {
    meetingsCount: meetings.length,
    pointsCount: points.length,
    pendingCount: points.filter((point) => point.status === 'pendiente').length,
    volverCount: points.filter((point) => point.status === 'volver').length,
    treatedCount: points.filter((point) => point.status === 'tratado').length,
    closedMeetings: meetings.filter((meeting) => meeting.status === 'closed').length,
    openMeetings: meetings.filter((meeting) => meeting.status === 'open').length,
  };
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-ES');
}

function pointOriginLabel(point: CoordinationPoint): string {
  return point.origin === 'task' ? 'Tarea' : 'Manual';
}

function buildDirectionSheet(workbook: ExcelWorkbook, meetings: CoordinationMeeting[]): void {
  const sheet = workbook.addWorksheet('Dirección', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
    properties: { defaultRowHeight: 22, showGridLines: false },
  });

  sheet.columns = [
    { width: 14 },
    { width: 14 },
    { width: 28 },
    { width: 34 },
    { width: 50 },
    { width: 18 },
  ];
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.4, header: 0.2, footer: 0.2 } };
  sheet.headerFooter = {
    oddFooter: '&LTrAccion · Coordinación Dirección&RPágina &P de &N',
  };

  const year = new Date().getFullYear();
  const stats = collectStats(meetings);
  const sorted = [...meetings].sort((a, b) => a.date.localeCompare(b.date));
  const points = sorted.flatMap((meeting) =>
    meeting.points.map((point) => ({
      meeting,
      point,
    })),
  );

  setMergedBlock(sheet, 'A1:F1', 'COORDINACIÓN · DIRECCIÓN', {
    fill: COLORS.white,
    fontColor: COLORS.burgundy,
    size: 23,
  });
  setMergedBlock(sheet, 'A2:D2', 'Seguimiento acumulado de reuniones y acuerdos', {
    fill: COLORS.white,
    fontColor: COLORS.slate,
    size: 12,
    bold: true,
  });
  setMergedBlock(sheet, 'E1:F2', `AÑO\n${year}`, {
    fill: COLORS.white,
    fontColor: COLORS.burgundy,
    size: 18,
    horizontal: 'center',
  });
  sheet.getCell('E1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getCell('A1').border = undefined;
  sheet.getCell('A2').border = undefined;
  sheet.getCell('E1').border = {
    left: { style: 'medium', color: { argb: COLORS.burgundy } },
  };

  setMergedBlock(sheet, 'A4:B5', `Reuniones\n${stats.meetingsCount}`, {
    fill: COLORS.burgundySoft,
    fontColor: COLORS.burgundy,
    size: 15,
  });
  setMergedBlock(sheet, 'C4:D5', `Puntos tratados\n${stats.pointsCount}`, {
    fill: COLORS.navySoft,
    fontColor: COLORS.navy,
    size: 15,
  });
  setMergedBlock(sheet, 'E4:E5', `Pendientes\n${stats.pendingCount}`, {
    fill: COLORS.amberSoft,
    fontColor: COLORS.amber,
    size: 15,
  });
  setMergedBlock(sheet, 'F4:F5', `Volver a tratar\n${stats.volverCount}`, {
    fill: COLORS.purpleSoft,
    fontColor: COLORS.purple,
    size: 15,
  });

  const tableStartRow = 7;
  const headers = ['Fecha', 'Origen', 'Punto', 'Detalle', 'Resultado / acuerdo', 'Estado'];
  headers.forEach((header, index) => {
    const col = String.fromCharCode(65 + index);
    const cell = sheet.getCell(`${col}${tableStartRow}`);
    cell.value = header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.white }, name: 'Calibri', size: 11 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  });
  sheet.getRow(tableStartRow).height = 25;
  sheet.autoFilter = { from: `A${tableStartRow}`, to: `F${Math.max(tableStartRow + 1, tableStartRow + points.length)}` };

  const currentRow = tableStartRow + 1;
  if (points.length === 0) {
    sheet.mergeCells(`A${currentRow}:F${currentRow}`);
    const cell = sheet.getCell(`A${currentRow}`);
    cell.value = 'Todavía no hay reuniones ni puntos registrados en Coordinación > Dirección.';
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    applyBorder(cell);
  } else {
    points.forEach(({ meeting, point }, index) => {
      const row = sheet.addRow([
        formatCoordinationDate(meeting.date),
        pointOriginLabel(point),
        point.title,
        point.detail || '—',
        point.result.trim() || '—',
        coordinationPointStatusLabel(point.status),
      ]);
      const rowNumber = currentRow + index;
      const bandedFill = index % 2 === 0 ? COLORS.white : 'F8FAFC';
      row.eachCell((cell, colNumber) => {
        cell.font = { color: { argb: COLORS.text }, name: 'Calibri', size: 10.5 };
        cell.alignment = { vertical: 'middle', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bandedFill } };
        applyBorder(cell);
        if (colNumber === 6) {
          const statusColors = statusFill(point.status);
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.fill } };
          cell.font = { color: { argb: statusColors.text }, bold: true, name: 'Calibri', size: 10.5 };
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        }
      });
      const rowRef = sheet.getRow(rowNumber);
      rowRef.height = 28;
    });
  }

  const footerRow = Math.max(currentRow + points.length + 1, 20);
  setMergedBlock(sheet, `A${footerRow}:D${footerRow}`, 'El diálogo de hoy construye el mejor lugar para trabajar mañana.', {
    fill: COLORS.noteBg,
    fontColor: COLORS.muted,
    size: 11,
    bold: false,
  });
  setMergedBlock(sheet, `E${footerRow}:F${footerRow}`, 'Recursos Humanos\nRelaciones Laborales', {
    fill: COLORS.white,
    fontColor: COLORS.burgundy,
    size: 10,
    horizontal: 'right',
  });
}

function buildSummarySheet(workbook: ExcelWorkbook, meetings: CoordinationMeeting[]): void {
  const sheet = workbook.addWorksheet('Resumen', {
    views: [{ state: 'frozen', ySplit: 7, showGridLines: false }],
    properties: { defaultRowHeight: 22, showGridLines: false },
  });
  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];

  const sorted = [...meetings].sort((a, b) => a.date.localeCompare(b.date));
  const stats = collectStats(meetings);

  setMergedBlock(sheet, 'A1:E1', 'RESUMEN · COORDINACIÓN DIRECCIÓN', {
    fill: COLORS.white,
    fontColor: COLORS.burgundy,
    size: 20,
  });
  setMergedBlock(sheet, 'A2:E2', 'Visión ejecutiva de reuniones, puntos y estado de avance.', {
    fill: COLORS.white,
    fontColor: COLORS.slate,
    size: 11,
    bold: true,
  });
  setMergedBlock(sheet, 'A4:A5', `Reuniones\n${stats.meetingsCount}`, { fill: COLORS.burgundySoft, fontColor: COLORS.burgundy, horizontal: 'center', size: 14 });
  setMergedBlock(sheet, 'B4:B5', `Abiertas\n${stats.openMeetings}`, { fill: COLORS.amberSoft, fontColor: COLORS.amber, horizontal: 'center', size: 14 });
  setMergedBlock(sheet, 'C4:C5', `Cerradas\n${stats.closedMeetings}`, { fill: COLORS.greenSoft, fontColor: COLORS.green, horizontal: 'center', size: 14 });
  setMergedBlock(sheet, 'D4:D5', `Tratados\n${stats.treatedCount}`, { fill: COLORS.navySoft, fontColor: COLORS.navy, horizontal: 'center', size: 14 });
  setMergedBlock(sheet, 'E4:E5', `Volver\n${stats.volverCount}`, { fill: COLORS.purpleSoft, fontColor: COLORS.purple, horizontal: 'center', size: 14 });

  const startRow = 7;
  ['Fecha', 'Estado', 'Nº puntos', 'Creada', 'Cerrada'].forEach((header, index) => {
    const col = String.fromCharCode(65 + index);
    const cell = sheet.getCell(`${col}${startRow}`);
    cell.value = header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.white }, name: 'Calibri', size: 11 };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    applyBorder(cell);
  });
  sheet.autoFilter = { from: `A${startRow}`, to: `E${Math.max(startRow + 1, startRow + sorted.length)}` };

  const rowNumber = startRow + 1;
  if (sorted.length === 0) {
    sheet.mergeCells(`A${rowNumber}:E${rowNumber}`);
    const cell = sheet.getCell(`A${rowNumber}`);
    cell.value = 'Sin reuniones registradas.';
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    cell.alignment = { horizontal: 'center' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    applyBorder(cell);
    return;
  }

  sorted.forEach((meeting, index) => {
    const row = sheet.addRow([
      formatCoordinationDate(meeting.date),
      getMeetingStateLabel(meeting.status),
      meeting.points.length,
      formatDateTime(meeting.createdAt),
      formatDateTime(meeting.closedAt),
    ]);
    row.eachCell((cell, colNumber) => {
      cell.font = { color: { argb: COLORS.text }, name: 'Calibri', size: 10.5 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? COLORS.white : 'F8FAFC' } };
      applyBorder(cell);
      if (colNumber === 2) {
        const fill = meeting.status === 'closed' ? COLORS.greenSoft : COLORS.amberSoft;
        const text = meeting.status === 'closed' ? COLORS.green : COLORS.amber;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        cell.font = { color: { argb: text }, bold: true, name: 'Calibri', size: 10.5 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    sheet.getRow(rowNumber + index).height = 25;
  });
}

function buildPendingSheet(workbook: ExcelWorkbook, meetings: CoordinationMeeting[]): void {
  const sheet = workbook.addWorksheet('Pendientes', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
    properties: { defaultRowHeight: 22, showGridLines: false },
  });
  sheet.columns = [
    { width: 16 },
    { width: 14 },
    { width: 30 },
    { width: 38 },
    { width: 16 },
    { width: 45 },
  ];

  const pendingPoints = [...meetings]
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((meeting) =>
      meeting.points
        .filter((point) => point.status === 'pendiente' || point.status === 'volver')
        .map((point) => ({ meeting, point })),
    );

  setMergedBlock(sheet, 'A1:F1', 'PUNTOS PENDIENTES · COORDINACIÓN DIRECCIÓN', {
    fill: COLORS.white,
    fontColor: COLORS.burgundy,
    size: 18,
  });
  setMergedBlock(sheet, 'A2:F2', 'Seguimiento de asuntos que siguen abiertos o deben volver a tratarse.', {
    fill: COLORS.white,
    fontColor: COLORS.slate,
    size: 11,
    bold: true,
  });

  const startRow = 4;
  ['Fecha reunión', 'Origen', 'Punto', 'Detalle', 'Estado', 'Último resultado'].forEach((header, index) => {
    const col = String.fromCharCode(65 + index);
    const cell = sheet.getCell(`${col}${startRow}`);
    cell.value = header;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.font = { bold: true, color: { argb: COLORS.white }, name: 'Calibri', size: 11 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  });
  sheet.autoFilter = { from: `A${startRow}`, to: `F${Math.max(startRow + 1, startRow + pendingPoints.length)}` };

  const rowNumber = startRow + 1;
  if (pendingPoints.length === 0) {
    sheet.mergeCells(`A${rowNumber}:F${rowNumber}`);
    const cell = sheet.getCell(`A${rowNumber}`);
    cell.value = 'No hay puntos pendientes ni asuntos para volver a tratar.';
    cell.font = { italic: true, color: { argb: COLORS.muted } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.light } };
    applyBorder(cell);
    return;
  }

  pendingPoints.forEach(({ meeting, point }, index) => {
    const row = sheet.addRow([
      formatCoordinationDate(meeting.date),
      pointOriginLabel(point),
      point.title,
      point.detail || '—',
      coordinationPointStatusLabel(point.status),
      point.result.trim() || 'Pendiente de completar en la reunión o seguimiento posterior.',
    ]);
    row.eachCell((cell, colNumber) => {
      cell.font = { color: { argb: COLORS.text }, name: 'Calibri', size: 10.5 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: index % 2 === 0 ? COLORS.white : 'F8FAFC' } };
      applyBorder(cell);
      if (colNumber === 5) {
        const statusColors = statusFill(point.status);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.fill } };
        cell.font = { color: { argb: statusColors.text }, bold: true, name: 'Calibri', size: 10.5 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    });
    sheet.getRow(rowNumber + index).height = 28;
  });
}

export async function syncCoordinacionExcelBackup(meetings: CoordinationMeeting[]): Promise<string | null> {
  const template = useConfiguracionStore.getState().rutaExportacionCoordinacion;
  if (!template.trim()) return 'Datos guardados en TrAccion. Configura en Ajustes la ruta del backup Excel de Coordinación.';
  if (!window.traccion?.saveOperationalExcelBackup) return 'Datos guardados en TrAccion, pero el backup Excel solo está disponible en la aplicación de escritorio.';

  try {
    const { default: ExcelJS } = await import('exceljs');
    const workbook = new ExcelJS.Workbook() as unknown as ExcelWorkbook;
    workbook.creator = 'TrAccion';
    workbook.subject = 'Histórico de Coordinación RRLL con Dirección';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sorted = [...meetings]
      .filter((meeting) => meeting.area === 'direccion')
      .sort((a, b) => a.date.localeCompare(b.date));

    buildDirectionSheet(workbook, sorted);
    buildSummarySheet(workbook, sorted);
    buildPendingSheet(workbook, sorted);

    const raw = await workbook.xlsx.writeBuffer();
    const currentYear = new Date().getFullYear();
    const directory = resolveDirectory(template, currentYear);
    const result = await window.traccion.saveOperationalExcelBackup({
      directory,
      fileName: 'Coordinacion_Direccion.xlsx',
      cleanupPrefix: 'Coordinacion_Direccion',
      buffer: toArrayBuffer(raw as ArrayBuffer | Uint8Array),
    });
    return result.ok ? null : result.message;
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se ha podido actualizar el Excel de Coordinación: ${error instanceof Error ? error.message : String(error)}`;
  }
}
