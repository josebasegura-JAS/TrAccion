import { useConfiguracionStore } from '../../features/configuracion/store/useConfiguracionStore';
import type {
  CoordinationArea,
  CoordinationMeeting,
  CoordinationPoint,
  CoordinationPointStatus,
} from '../../features/coordinacion/domain/coordinacion';
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
};

type ExcelRow = {
  height?: number;
  eachCell: (callback: (cell: ExcelCell, colNumber: number) => void) => void;
  getCell: (index: number) => ExcelCell;
};

type ExcelWorksheet = {
  properties: Record<string, unknown>;
  views: Record<string, unknown>[];
  columns: Array<{ header?: string; key?: string; width?: number }>;
  addRow: (values: Record<string, unknown> | unknown[]) => ExcelRow;
  getRow: (rowNumber: number) => ExcelRow;
  getCell: (address: string) => ExcelCell;
  mergeCells: (range: string) => void;
  autoFilter?: string | { from: string; to: string };
  pageSetup?: Record<string, unknown>;
  headerFooter?: Record<string, unknown>;
};

type ExcelWorkbook = {
  creator?: string;
  subject?: string;
  created?: Date;
  modified?: Date;
  addWorksheet: (name: string, options?: Record<string, unknown>) => ExcelWorksheet;
  xlsx: { writeBuffer: () => Promise<ArrayBuffer | Uint8Array> };
};

type WorkbookKind = 'direccion' | 'otras-areas' | 'sindicatos';

type WorkbookDefinition = {
  kind: WorkbookKind;
  area: CoordinationArea;
  title: string;
  subtitle: string;
  subject: string;
  fileName: string;
  cleanupPrefix: string;
};

const WORKBOOKS: WorkbookDefinition[] = [
  {
    kind: 'direccion', area: 'direccion', title: 'COORDINACIÓN DIRECCIÓN',
    subtitle: 'Seguimiento ejecutivo de reuniones, asuntos y acuerdos con Dirección.',
    subject: 'Histórico de Coordinación RRLL con Dirección',
    fileName: 'Coordinacion_Direccion.xlsx', cleanupPrefix: 'Coordinacion_Direccion',
  },
  {
    kind: 'otras-areas', area: 'otras-areas', title: 'COORDINACIÓN OTRAS ÁREAS',
    subtitle: 'Seguimiento de reuniones y compromisos con las áreas de la organización.',
    subject: 'Histórico de Coordinación RRLL con otras áreas',
    fileName: 'Coordinacion_Otras_Areas.xlsx', cleanupPrefix: 'Coordinacion_Otras_Areas',
  },
  {
    kind: 'sindicatos', area: 'sindicatos', title: 'COORDINACIÓN SINDICATOS',
    subtitle: 'Histórico por organización, asuntos pendientes y compromisos de seguimiento.',
    subject: 'Histórico de Coordinación RRLL con sindicatos',
    fileName: 'Coordinacion_Sindicatos.xlsx', cleanupPrefix: 'Coordinacion_Sindicatos',
  },
];

const COLORS = {
  navy: '174A7E', navyDark: '10375E', navySoft: 'EAF2F9',
  burgundy: '8A1538', burgundySoft: 'F8ECF0',
  green: '17844B', greenSoft: 'E7F6ED',
  amber: 'C77800', amberSoft: 'FFF2D6',
  red: 'B42318', redSoft: 'FDE8E7',
  purple: '6D4DA1', purpleSoft: 'F0EAF8',
  sky: '2368A2', skySoft: 'E5F2FB',
  text: '26364A', muted: '6B7788', border: 'D5DEE8', white: 'FFFFFF', light: 'F7F9FC',
};

function columnLetter(index: number): string {
  let value = index;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function fill(color: string): Record<string, unknown> {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

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
    border?: boolean;
  },
): void {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(':')[0]);
  cell.value = value;
  cell.fill = fill(options.fill);
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
  if (options.border !== false) applyBorder(cell);
}

function configureSheet(sheet: ExcelWorksheet, widths: number[], frozenRows: number): void {
  sheet.columns = widths.map((width) => ({ width }));
  sheet.views = [{ state: 'frozen', ySplit: frozenRows, showGridLines: false }];
  sheet.properties = { defaultRowHeight: 22, showGridLines: false };
  sheet.pageSetup = {
    orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = { oddFooter: '&LTrAccion · Coordinación RRLL&RPágina &P de &N' };
}

function formatUpdatedAt(value: Date): string {
  return value.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function setSheetHeading(
  sheet: ExcelWorksheet,
  columnCount: number,
  title: string,
  subtitle: string,
  updatedAt: Date,
): void {
  const lastColumn = columnLetter(columnCount);
  const updateStart = columnLetter(Math.max(2, columnCount - 2));
  const subtitleEnd = columnLetter(Math.max(1, columnCount - 3));
  setMergedBlock(sheet, `A1:${lastColumn}1`, title, {
    fill: COLORS.navy, fontColor: COLORS.white, size: 21, border: false,
  });
  sheet.getRow(1).height = 35;
  setMergedBlock(sheet, `A2:${subtitleEnd}2`, subtitle, {
    fill: COLORS.white, fontColor: COLORS.muted, size: 10.5, bold: true, border: false,
  });
  setMergedBlock(sheet, `${updateStart}2:${lastColumn}2`, `Actualizado: ${formatUpdatedAt(updatedAt)}`, {
    fill: COLORS.white, fontColor: COLORS.navy, size: 10.5, horizontal: 'right', border: false,
  });
}

function styleTableHeader(sheet: ExcelWorksheet, rowNumber: number, headers: string[]): void {
  headers.forEach((header, index) => {
    const cell = sheet.getCell(`${columnLetter(index + 1)}${rowNumber}`);
    cell.value = header;
    cell.fill = fill(COLORS.navyDark);
    cell.font = { bold: true, color: { argb: COLORS.white }, name: 'Calibri', size: 10.5 };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  });
  sheet.getRow(rowNumber).height = 26;
}

function styleDataRow(row: ExcelRow, index: number, statusColumn?: number, status?: CoordinationPointStatus): void {
  row.eachCell((cell, colNumber) => {
    cell.font = { color: { argb: COLORS.text }, name: 'Calibri', size: 10 };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.fill = fill(index % 2 === 0 ? COLORS.white : COLORS.light);
    applyBorder(cell);
    if (statusColumn && status && colNumber === statusColumn) {
      const colors = statusFill(status);
      cell.fill = fill(colors.fill);
      cell.font = { color: { argb: colors.text }, bold: true, name: 'Calibri', size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  });
  row.height = 28;
}

function addEmptyState(sheet: ExcelWorksheet, rowNumber: number, columnCount: number, message: string): void {
  const lastColumn = columnLetter(columnCount);
  sheet.mergeCells(`A${rowNumber}:${lastColumn}${rowNumber}`);
  const cell = sheet.getCell(`A${rowNumber}`);
  cell.value = message;
  cell.font = { italic: true, color: { argb: COLORS.muted }, name: 'Calibri', size: 10.5 };
  cell.fill = fill(COLORS.light);
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  applyBorder(cell);
  sheet.getRow(rowNumber).height = 30;
}

function statusFill(status: CoordinationPointStatus): { fill: string; text: string } {
  if (status === 'tratado') return { fill: COLORS.greenSoft, text: COLORS.green };
  if (status === 'volver') return { fill: COLORS.purpleSoft, text: COLORS.purple };
  if (status === 'pendiente-rrll') return { fill: COLORS.skySoft, text: COLORS.sky };
  if (status === 'pendiente-sindicato') return { fill: COLORS.amberSoft, text: COLORS.amber };
  return { fill: COLORS.amberSoft, text: COLORS.amber };
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('es-ES');
}

function pointOriginLabel(point: CoordinationPoint): string {
  return point.origin === 'task' ? 'Tarea' : 'Manual';
}

function meetingContext(meeting: CoordinationMeeting, kind: WorkbookKind): string {
  if (kind === 'sindicatos') return meeting.unionName?.trim() || 'Sin sindicato';
  if (kind === 'otras-areas') return meeting.areaName?.trim() || 'Sin área';
  return 'Dirección';
}

function meetingTypeLabel(meeting: CoordinationMeeting, kind: WorkbookKind): string {
  if (kind === 'sindicatos') {
    if (meeting.meetingType === 'urgente') return 'Urgente';
    if (meeting.meetingType === 'seguimiento') return 'Seguimiento';
    return 'Ordinaria';
  }
  return meeting.status === 'closed' ? 'Cerrada' : 'Abierta';
}

function unresolved(point: CoordinationPoint): boolean {
  return point.status !== 'tratado';
}

function isOverdue(point: CoordinationPoint, today: string): boolean {
  return unresolved(point) && Boolean(point.dueDate) && (point.dueDate ?? '') < today;
}

function collectStats(meetings: CoordinationMeeting[], today: string) {
  const points = meetings.flatMap((meeting) => meeting.points);
  return {
    meetingsCount: meetings.length,
    pointsCount: points.length,
    pendingCount: points.filter(unresolved).length,
    closedMeetings: meetings.filter((meeting) => meeting.status === 'closed').length,
    overdueCount: points.filter((point) => isOverdue(point, today)).length,
  };
}

function buildSummarySheet(
  workbook: ExcelWorkbook,
  meetings: CoordinationMeeting[],
  definition: WorkbookDefinition,
  updatedAt: Date,
): void {
  const sheet = workbook.addWorksheet('Resumen');
  configureSheet(sheet, [24, 14, 15, 15, 18, 18, 18, 18], 7);
  setSheetHeading(sheet, 8, definition.title, definition.subtitle, updatedAt);

  const today = updatedAt.toISOString().slice(0, 10);
  const stats = collectStats(meetings, today);
  const fourthLabel = definition.kind === 'sindicatos' ? 'Vencidos' : 'Cerradas';
  const fourthValue = definition.kind === 'sindicatos' ? stats.overdueCount : stats.closedMeetings;
  const fourthFill = definition.kind === 'sindicatos' && stats.overdueCount > 0 ? COLORS.redSoft : COLORS.greenSoft;
  const fourthText = definition.kind === 'sindicatos' && stats.overdueCount > 0 ? COLORS.red : COLORS.green;

  setMergedBlock(sheet, 'A4:B5', `Reuniones\n${stats.meetingsCount}`, { fill: COLORS.navySoft, fontColor: COLORS.navy, size: 15, horizontal: 'center' });
  setMergedBlock(sheet, 'C4:D5', `Asuntos\n${stats.pointsCount}`, { fill: COLORS.burgundySoft, fontColor: COLORS.burgundy, size: 15, horizontal: 'center' });
  setMergedBlock(sheet, 'E4:F5', `Pendientes\n${stats.pendingCount}`, { fill: COLORS.amberSoft, fontColor: COLORS.amber, size: 15, horizontal: 'center' });
  setMergedBlock(sheet, 'G4:H5', `${fourthLabel}\n${fourthValue}`, { fill: fourthFill, fontColor: fourthText, size: 15, horizontal: 'center' });

  const categoryCounts = new Map<string, { meetings: number; points: number; pending: number }>();
  meetings.forEach((meeting) => {
    const category = definition.kind === 'direccion'
      ? (meeting.status === 'closed' ? 'Reuniones cerradas' : 'Reuniones abiertas')
      : meetingContext(meeting, definition.kind);
    const current = categoryCounts.get(category) ?? { meetings: 0, points: 0, pending: 0 };
    current.meetings += 1;
    current.points += meeting.points.length;
    current.pending += meeting.points.filter(unresolved).length;
    categoryCounts.set(category, current);
  });
  const categories = [...categoryCounts.entries()].sort((a, b) => b[1].meetings - a[1].meetings || a[0].localeCompare(b[0], 'es'));

  setMergedBlock(sheet, 'A7:D7', definition.kind === 'sindicatos' ? 'ACTIVIDAD POR SINDICATO' : definition.kind === 'otras-areas' ? 'ACTIVIDAD POR ÁREA' : 'ESTADO DE LAS REUNIONES', {
    fill: COLORS.white, fontColor: COLORS.navy, size: 12, border: false,
  });
  styleTableHeader(sheet, 8, ['Ámbito', 'Reuniones', 'Asuntos', 'Pendientes']);
  if (categories.length === 0) {
    addEmptyState(sheet, 9, 4, 'Sin actividad registrada.');
  } else {
    categories.forEach(([category, values], index) => {
      const row = sheet.addRow([category, values.meetings, values.points, values.pending]);
      styleDataRow(row, index);
      row.getCell(2).fill = fill(COLORS.navySoft);
      row.getCell(2).font = { color: { argb: COLORS.navy }, bold: true, name: 'Calibri', size: 10 };
      row.getCell(4).fill = fill(values.pending > 0 ? COLORS.amberSoft : COLORS.greenSoft);
      row.getCell(4).font = { color: { argb: values.pending > 0 ? COLORS.amber : COLORS.green }, bold: true, name: 'Calibri', size: 10 };
    });
  }

  const recentStart = Math.max(9 + categories.length + 2, 15);
  setMergedBlock(sheet, `A${recentStart}:H${recentStart}`, 'ÚLTIMAS REUNIONES', {
    fill: COLORS.white, fontColor: COLORS.navy, size: 12, border: false,
  });
  const recentHeader = recentStart + 1;
  styleTableHeader(sheet, recentHeader, ['Fecha', 'Ámbito', 'Tipo / estado', 'Interlocutores', 'Objetivo', 'Asuntos', 'Pendientes', 'Cierre']);
  const recent = [...meetings].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  if (recent.length === 0) {
    addEmptyState(sheet, recentHeader + 1, 8, 'Todavía no hay reuniones registradas.');
  } else {
    recent.forEach((meeting, index) => {
      const row = sheet.addRow([
        formatCoordinationDate(meeting.date), meetingContext(meeting, definition.kind),
        meetingTypeLabel(meeting, definition.kind), meeting.interlocutors?.trim() || '—',
        meeting.purpose?.trim() || '—', meeting.points.length,
        meeting.points.filter(unresolved).length, formatDateTime(meeting.closedAt),
      ]);
      styleDataRow(row, index);
    });
  }
}

function historyColumns(kind: WorkbookKind): { widths: number[]; headers: string[] } {
  if (kind === 'sindicatos') return {
    widths: [14, 19, 15, 24, 31, 18, 22, 16, 38],
    headers: ['Fecha', 'Sindicato', 'Tipo', 'Interlocutores', 'Asunto', 'Estado', 'Responsable', 'Compromiso', 'Resultado / acuerdo'],
  };
  if (kind === 'otras-areas') return {
    widths: [14, 21, 24, 28, 31, 18, 42],
    headers: ['Fecha', 'Área', 'Interlocutores', 'Objetivo', 'Asunto', 'Estado', 'Resultado / acuerdo'],
  };
  return {
    widths: [14, 14, 31, 38, 18, 44],
    headers: ['Fecha', 'Origen', 'Asunto', 'Detalle', 'Estado', 'Resultado / acuerdo'],
  };
}

function historyValues(meeting: CoordinationMeeting, point: CoordinationPoint, kind: WorkbookKind): unknown[] {
  if (kind === 'sindicatos') return [
    formatCoordinationDate(meeting.date), meetingContext(meeting, kind), meetingTypeLabel(meeting, kind),
    meeting.interlocutors?.trim() || '—', point.title, coordinationPointStatusLabel(point.status),
    point.responsible?.trim() || '—', point.dueDate ? formatCoordinationDate(point.dueDate) : '—', point.result.trim() || '—',
  ];
  if (kind === 'otras-areas') return [
    formatCoordinationDate(meeting.date), meetingContext(meeting, kind), meeting.interlocutors?.trim() || '—',
    meeting.purpose?.trim() || '—', point.title, coordinationPointStatusLabel(point.status), point.result.trim() || '—',
  ];
  return [
    formatCoordinationDate(meeting.date), pointOriginLabel(point), point.title, point.detail || '—',
    coordinationPointStatusLabel(point.status), point.result.trim() || '—',
  ];
}

function buildHistorySheet(
  workbook: ExcelWorkbook,
  meetings: CoordinationMeeting[],
  definition: WorkbookDefinition,
  updatedAt: Date,
): void {
  const layout = historyColumns(definition.kind);
  const sheet = workbook.addWorksheet('Histórico');
  configureSheet(sheet, layout.widths, 4);
  setSheetHeading(sheet, layout.headers.length, `HISTÓRICO · ${definition.title.replace('COORDINACIÓN ', '')}`, 'Detalle acumulado de todos los asuntos registrados.', updatedAt);
  styleTableHeader(sheet, 4, layout.headers);
  const rows = [...meetings].sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((meeting) => meeting.points.map((point) => ({ meeting, point })));
  sheet.autoFilter = { from: 'A4', to: `${columnLetter(layout.headers.length)}${Math.max(5, 4 + rows.length)}` };
  if (rows.length === 0) {
    addEmptyState(sheet, 5, layout.headers.length, 'No hay asuntos registrados en este ámbito.');
    return;
  }
  rows.forEach(({ meeting, point }, index) => {
    const row = sheet.addRow(historyValues(meeting, point, definition.kind));
    styleDataRow(row, index, definition.kind === 'direccion' ? 5 : 6, point.status);
  });
}

function pendingColumns(kind: WorkbookKind): { widths: number[]; headers: string[] } {
  if (kind === 'sindicatos') return {
    widths: [14, 19, 33, 18, 22, 16, 40],
    headers: ['Fecha reunión', 'Sindicato', 'Asunto pendiente', 'Estado', 'Responsable', 'Compromiso', 'Último resultado'],
  };
  return {
    widths: [14, 22, 14, 34, 18, 44],
    headers: ['Fecha reunión', 'Ámbito', 'Origen', 'Asunto pendiente', 'Estado', 'Último resultado'],
  };
}

function buildPendingSheet(
  workbook: ExcelWorkbook,
  meetings: CoordinationMeeting[],
  definition: WorkbookDefinition,
  updatedAt: Date,
): void {
  const layout = pendingColumns(definition.kind);
  const sheet = workbook.addWorksheet('Pendientes');
  configureSheet(sheet, layout.widths, 4);
  setSheetHeading(sheet, layout.headers.length, `PENDIENTES · ${definition.title.replace('COORDINACIÓN ', '')}`, 'Asuntos abiertos, compromisos pendientes y puntos que deben volver a tratarse.', updatedAt);
  styleTableHeader(sheet, 4, layout.headers);
  const rows = [...meetings].sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((meeting) => meeting.points.filter(unresolved).map((point) => ({ meeting, point })));
  sheet.autoFilter = { from: 'A4', to: `${columnLetter(layout.headers.length)}${Math.max(5, 4 + rows.length)}` };
  if (rows.length === 0) {
    addEmptyState(sheet, 5, layout.headers.length, 'No hay asuntos pendientes en este ámbito.');
    return;
  }
  rows.forEach(({ meeting, point }, index) => {
    const values = definition.kind === 'sindicatos'
      ? [formatCoordinationDate(meeting.date), meetingContext(meeting, definition.kind), point.title, coordinationPointStatusLabel(point.status), point.responsible?.trim() || '—', point.dueDate ? formatCoordinationDate(point.dueDate) : '—', point.result.trim() || 'Pendiente de completar']
      : [formatCoordinationDate(meeting.date), meetingContext(meeting, definition.kind), pointOriginLabel(point), point.title, coordinationPointStatusLabel(point.status), point.result.trim() || 'Pendiente de completar'];
    const row = sheet.addRow(values);
    styleDataRow(row, index, definition.kind === 'sindicatos' ? 4 : 5, point.status);
  });
}

function buildCommitmentsSheet(
  workbook: ExcelWorkbook,
  meetings: CoordinationMeeting[],
  definition: WorkbookDefinition,
  updatedAt: Date,
): void {
  const sheet = workbook.addWorksheet('Compromisos');
  const headers = ['Fecha reunión', 'Sindicato', 'Asunto', 'Estado', 'Responsable', 'Fecha compromiso', 'Situación', 'Resultado / acuerdo'];
  configureSheet(sheet, [14, 19, 34, 19, 22, 17, 16, 42], 4);
  setSheetHeading(sheet, 8, 'COMPROMISOS · SINDICATOS', 'Control de responsables, fechas acordadas y compromisos vencidos.', updatedAt);
  styleTableHeader(sheet, 4, headers);
  const today = updatedAt.toISOString().slice(0, 10);
  const rows = [...meetings].sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((meeting) => meeting.points
      .filter((point) => unresolved(point) && Boolean(point.responsible?.trim() || point.dueDate))
      .map((point) => ({ meeting, point })));
  sheet.autoFilter = { from: 'A4', to: `H${Math.max(5, 4 + rows.length)}` };
  if (rows.length === 0) {
    addEmptyState(sheet, 5, 8, 'No hay compromisos abiertos con responsable o fecha asignados.');
    return;
  }
  rows.forEach(({ meeting, point }, index) => {
    const overdue = isOverdue(point, today);
    const situation = overdue ? 'Vencido' : point.dueDate ? 'En plazo' : 'Sin fecha';
    const row = sheet.addRow([
      formatCoordinationDate(meeting.date), meetingContext(meeting, definition.kind), point.title,
      coordinationPointStatusLabel(point.status), point.responsible?.trim() || '—',
      point.dueDate ? formatCoordinationDate(point.dueDate) : '—', situation, point.result.trim() || '—',
    ]);
    styleDataRow(row, index, 4, point.status);
    row.getCell(7).fill = fill(overdue ? COLORS.redSoft : point.dueDate ? COLORS.greenSoft : COLORS.amberSoft);
    row.getCell(7).font = { color: { argb: overdue ? COLORS.red : point.dueDate ? COLORS.green : COLORS.amber }, bold: true, name: 'Calibri', size: 10 };
    row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
  });
}

function createWorkbook(
  ExcelJS: { Workbook: new () => unknown },
  definition: WorkbookDefinition,
  meetings: CoordinationMeeting[],
  updatedAt: Date,
): ExcelWorkbook {
  const workbook = new ExcelJS.Workbook() as ExcelWorkbook;
  workbook.creator = 'TrAccion';
  workbook.subject = definition.subject;
  workbook.created = updatedAt;
  workbook.modified = updatedAt;
  buildSummarySheet(workbook, meetings, definition, updatedAt);
  buildHistorySheet(workbook, meetings, definition, updatedAt);
  buildPendingSheet(workbook, meetings, definition, updatedAt);
  if (definition.kind === 'sindicatos') buildCommitmentsSheet(workbook, meetings, definition, updatedAt);
  return workbook;
}

export async function syncCoordinacionExcelBackup(meetings: CoordinationMeeting[]): Promise<string | null> {
  const template = useConfiguracionStore.getState().rutaExportacionCoordinacion;
  if (!template.trim()) return 'Datos guardados en TrAccion. Configura en Ajustes la ruta del backup Excel de Coordinación.';
  if (!window.traccion?.saveOperationalExcelBackup) return 'Datos guardados en TrAccion, pero el backup Excel solo está disponible en la aplicación de escritorio.';

  try {
    const { default: ExcelJS } = await import('exceljs');
    const updatedAt = new Date();
    const directory = resolveDirectory(template, updatedAt.getFullYear());
    const failures: string[] = [];
    for (const definition of WORKBOOKS) {
      const scopedMeetings = [...meetings]
        .filter((meeting) => meeting.area === definition.area)
        .sort((a, b) => a.date.localeCompare(b.date));
      const workbook = createWorkbook(ExcelJS, definition, scopedMeetings, updatedAt);
      const raw = await workbook.xlsx.writeBuffer();
      const result = await window.traccion.saveOperationalExcelBackup({
        directory,
        fileName: definition.fileName,
        cleanupPrefix: definition.cleanupPrefix,
        buffer: toArrayBuffer(raw as ArrayBuffer | Uint8Array),
      });
      if (!result.ok) failures.push(`${definition.fileName}: ${result.message}`);
    }
    return failures.length > 0
      ? `Datos guardados en TrAccion, pero no se han podido actualizar todos los Excel de Coordinación: ${failures.join(' | ')}`
      : null;
  } catch (error) {
    return `Datos guardados en TrAccion, pero no se han podido actualizar los Excel de Coordinación: ${error instanceof Error ? error.message : String(error)}`;
  }
}
