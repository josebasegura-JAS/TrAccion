import type { ExportCellValue, ExportTablePayload } from './types';

const DANGEROUS_EXCEL_PREFIXES = ['=', '+', '-', '@'];

export function formatExportDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function sanitizeFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function buildStableExportFilename(filename: string, generatedAt = new Date()): string {
  const sanitized = sanitizeFilenamePart(filename) || 'exportacion';
  return `${sanitized}-${formatExportDate(generatedAt)}.xlsx`;
}

export function normalizeCellValue(value: ExportCellValue): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

export function escapeExcelValue(value: ExportCellValue): string {
  const normalized = normalizeCellValue(value);
  const trimmedStart = normalized.trimStart();

  if (DANGEROUS_EXCEL_PREFIXES.some((prefix) => trimmedStart.startsWith(prefix))) {
    return `'${normalized}`;
  }

  return normalized;
}

export function escapeHtml(value: ExportCellValue): string {
  return normalizeCellValue(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildExcelTableHtml<T>(payload: ExportTablePayload<T>): string {
  const generatedAt = payload.generatedAt ?? new Date();
  const filterLabel = payload.filterLabel?.trim();
  const headerRows = [
    `<tr><th colspan="${payload.columns.length}">${escapeHtml(payload.title)}</th></tr>`,
    `<tr><td colspan="${payload.columns.length}">Generado: ${escapeHtml(generatedAt.toLocaleString('es-ES'))}</td></tr>`,
  ];

  if (filterLabel) {
    headerRows.push(
      `<tr><td colspan="${payload.columns.length}">Filtros: ${escapeHtml(filterLabel)}</td></tr>`,
    );
  }

  const columnHeaders = payload.columns
    .map((column) => `<th>${escapeHtml(column.header)}</th>`)
    .join('');
  const bodyRows = payload.rows
    .map((row) => {
      const cells = payload.columns
        .map((column) => {
          const value = escapeExcelValue(column.value(row));
          return `<td style="mso-number-format:'\\@';white-space:pre-wrap">${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${headerRows.join('')}<tr></tr><thead><tr>${columnHeaders}</tr></thead><tbody>${bodyRows}</tbody></table></body></html>`;
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_SHEET_NAME = 'Exportacion';
const EXPORT_COLORS = {
  titleBackground: '#1f2937',
  generatedText: '#64748b',
  headerBackground: '#dc2626',
  headerBorder: '#991b1b',
  dataText: '#111827',
  dataBackground: '#ffffff',
  dataAlternateBackground: '#f8fafc',
  dataBorder: '#e5e7eb',
  statePending: '#fef3c7',
  stateInProgress: '#dbeafe',
  stateDone: '#dcfce7',
  stateBlocked: '#fee2e2',
} as const;

function toExcelColor(hex: string): { argb: string } {
  return { argb: `FF${hex.replace('#', '').toUpperCase()}` };
}

function normalizeStatusToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function getStatusFillColor(columnHeader: string, rawValue: ExportCellValue): string | null {
  if (normalizeStatusToken(columnHeader) !== 'estado') {
    return null;
  }

  const value = normalizeStatusToken(normalizeCellValue(rawValue));

  if (!value) {
    return null;
  }

  if (['pendiente', 'por validar', 'pendiente de firma', 'pendiente alegaciones'].some((token) => value.includes(token))) {
    return EXPORT_COLORS.statePending;
  }

  if (['en curso', 'abierta', 'abierto', 'nuevo', 'nueva'].some((token) => value.includes(token))) {
    return EXPORT_COLORS.stateInProgress;
  }

  if (['resuelta', 'resuelto', 'cerrada', 'cerrado', 'aprobada', 'aprobado', 'validada', 'validado'].some((token) => value.includes(token))) {
    return EXPORT_COLORS.stateDone;
  }

  if (['bloqueada', 'bloqueado', 'denegada', 'denegado', 'critica', 'critico', 'error'].some((token) => value.includes(token))) {
    return EXPORT_COLORS.stateBlocked;
  }

  return null;
}

function buildWorksheetName(filename: string): string {
  const sanitized = filename.replace(/[\\/*?:[\]]/g, ' ').trim() || DEFAULT_SHEET_NAME;
  return sanitized.slice(0, 31);
}

function buildIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function normalizeWorkbookBuffer(buffer: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }

  const copy = new Uint8Array(buffer.byteLength);
  copy.set(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  return copy.buffer;
}

export async function openWorkbookInExcel(
  buffer: ArrayBuffer | ArrayBufferView,
  filename: string,
): Promise<void> {
  const openExcelWorkbook = window.traccion?.openExcelWorkbook;

  if (!openExcelWorkbook) {
    throw new Error('La apertura directa en Excel no está disponible en este entorno.');
  }

  const result = await openExcelWorkbook(normalizeWorkbookBuffer(buffer), filename);
  if (!result.ok) {
    throw new Error(result.message || 'No se ha podido abrir el Excel generado.');
  }
}

export async function exportTableToExcel<T>(payload: ExportTablePayload<T>, onAlert?: (message: string) => void): Promise<void> {
  try {
  const { default: ExcelJS } = await import('exceljs');
  const generatedAt = payload.generatedAt ?? new Date();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TrAccion';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const isTicketRestaurantMonthlyPreset =
    payload.formatPreset === 'ticket-restaurante-monthly';
  const worksheet = workbook.addWorksheet(buildWorksheetName(payload.filename), {
    views: [{ state: 'frozen', ySplit: isTicketRestaurantMonthlyPreset ? 6 : 4 }],
  });

  const columnCount = Math.max(payload.columns.length, 1);

  if (isTicketRestaurantMonthlyPreset) {
    const orange = toExcelColor('#FF9900');
    const grey = toExcelColor('#A6A6A6');
    const white = toExcelColor('#FFFFFF');
    const black = toExcelColor('#000000');
    const manualDebtFill = toExcelColor('#DDEBF7');
    const regularizationFill = toExcelColor('#FFF2CC');
    const calendarPalette = [
      '#EAF2F8',
      '#E8F5E9',
      '#FDF2E9',
      '#F4ECF7',
      '#FFF8E1',
      '#FCEEF2',
      '#E8F6F3',
      '#F2F3F4',
    ];
    const calendarColorByGroup = new Map<string, string>();
    if (payload.rowGroupValue) {
      payload.rows.forEach((row) => {
        const group = normalizeCellValue(payload.rowGroupValue?.(row)).trim() || 'Sin calendario';
        if (!calendarColorByGroup.has(group)) {
          calendarColorByGroup.set(
            group,
            calendarPalette[calendarColorByGroup.size % calendarPalette.length] ?? '#FFFFFF',
          );
        }
      });
    }
    const thinBlackBorder = { style: 'thin' as const, color: black };
    const allThinBorders = {
      top: thinBlackBorder,
      bottom: thinBlackBorder,
      left: thinBlackBorder,
      right: thinBlackBorder,
    };
    const periodLabel = payload.filename
      .replace(/^Computo_/i, '')
      .replace(/_/g, ' ')
      .trim();

    worksheet.mergeCells('A2:I2');
    const instructionCell = worksheet.getCell('A2');
    instructionCell.value =
      'Cómputo mensual para solicitar cargas y descargas de saldo de Tarjetas Cheque Gourmet';
    instructionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: grey };
    instructionCell.font = { color: white, bold: true, size: 10 };
    instructionCell.alignment = { horizontal: 'left', vertical: 'middle' };
    instructionCell.border = allThinBorders;

    worksheet.mergeCells('J2:K2');
    const periodCell = worksheet.getCell('J2');
    periodCell.value = `Tickets ${periodLabel}`;
    periodCell.fill = { type: 'pattern', pattern: 'solid', fgColor: orange };
    periodCell.font = { color: black, bold: true, size: 10 };
    periodCell.alignment = { horizontal: 'center', vertical: 'middle' };
    periodCell.border = allThinBorders;

    worksheet.mergeCells('L2:M2');
    const budgetCell = worksheet.getCell('L2');
    budgetCell.value = 'Presupuesto';
    budgetCell.fill = { type: 'pattern', pattern: 'solid', fgColor: orange };
    budgetCell.font = { color: black, bold: true, size: 10 };
    budgetCell.alignment = { horizontal: 'center', vertical: 'middle' };
    budgetCell.border = allThinBorders;

    worksheet.mergeCells('L3:M3');
    const actualCell = worksheet.getCell('L3');
    actualCell.value = 'Real';
    actualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: orange };
    actualCell.font = { color: black, bold: true, size: 10 };
    actualCell.alignment = { horizontal: 'center', vertical: 'middle' };
    actualCell.border = allThinBorders;

    const totalColumnIndex = payload.columns.findIndex((column) => column.key === 'total') + 1;
    const summaryCell = worksheet.getCell('N3');
    if (totalColumnIndex > 0 && payload.rows.length > 0) {
      const totalLetter = worksheet.getColumn(totalColumnIndex).letter;
      summaryCell.value = { formula: `SUM(${totalLetter}7:${totalLetter}${payload.rows.length + 6})` };
      summaryCell.numFmt = '#,##0.00';
    } else {
      summaryCell.value = 0;
    }
    summaryCell.font = { color: black, bold: true, size: 10 };
    summaryCell.alignment = { horizontal: 'center', vertical: 'middle' };
    summaryCell.border = allThinBorders;

    worksheet.mergeCells('A5:B5');
    const sectionCell = worksheet.getCell('A5');
    sectionCell.value = 'Tarjeta Cheque Gourmet';
    sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: orange };
    sectionCell.font = { color: black, bold: true, size: 11 };
    sectionCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sectionCell.border = allThinBorders;

    const headerRow = worksheet.getRow(6);
    payload.columns.forEach((column, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = column.header;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: orange };
      cell.font = { color: black, bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = allThinBorders;
    });
    headerRow.height = 50;

    const parseSpanishDate = (value: string): Date | null => {
      const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
      if (!match) return null;
      return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
    };

    payload.rows.forEach((row, rowIndex) => {
      const excelRow = worksheet.getRow(rowIndex + 7);
      const group = payload.rowGroupValue
        ? normalizeCellValue(payload.rowGroupValue(row)).trim() || 'Sin calendario'
        : '';
      const groupFill = group
        ? toExcelColor(calendarColorByGroup.get(group) ?? '#FFFFFF')
        : white;

      payload.columns.forEach((column, columnIndex) => {
        const cell = excelRow.getCell(columnIndex + 1);
        const value = column.value(row);
        const hasValue = Boolean(normalizeCellValue(value).trim());
        const isManualDebtColumn = column.key === 'deudaManual';
        const isRegularizationColumn = column.key === 'regularizacionDeuda';
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor:
            isRegularizationColumn && hasValue
              ? regularizationFill
              : isManualDebtColumn && hasValue
                ? manualDebtFill
                : groupFill,
        };
        cell.font = { color: black, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: isManualDebtColumn || isRegularizationColumn };
        cell.border = allThinBorders;

        if (value === null || value === undefined || value === '') {
          cell.value = null;
          return;
        }

        if (typeof value === 'number') {
          cell.value = value;
          if (column.key === 'importe' || column.key === 'total') {
            cell.numFmt = '#,##0.00';
          }
          return;
        }

        const textValue = String(value);
        if (column.key === 'fecInicio' || column.key === 'fecCad') {
          const parsedDate = parseSpanishDate(textValue);
          if (parsedDate) {
            cell.value = parsedDate;
            cell.numFmt = 'dd/mm/yyyy';
            return;
          }
        }
        cell.value = textValue;
      });
      excelRow.height = 18;
    });

    const presetWidths = [17, 22, 22, 22, 22, 19.1, 13.4, 13.4, 23.4, 19.6, 18.9, 13.8, 20, 32, 34];
    payload.columns.forEach((_, columnIndex) => {
      worksheet.getColumn(columnIndex + 1).width = presetWidths[columnIndex] ?? 18;
    });

    const lastDataRow = Math.max(payload.rows.length + 6, 6);
    worksheet.autoFilter = {
      from: { row: 6, column: 1 },
      to: { row: lastDataRow, column: columnCount },
    };
    worksheet.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    };
    worksheet.getRow(2).height = 22;
    worksheet.getRow(5).height = 22;

    const buffer = await workbook.xlsx.writeBuffer();
    await openWorkbookInExcel(buffer, buildStableExportFilename(payload.filename, generatedAt));
    return;
  }
  const lastColumnLetter = worksheet.getColumn(columnCount).letter;

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = payload.title;
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor(EXPORT_COLORS.titleBackground),
  };
  titleCell.font = { color: toExcelColor('#ffffff'), bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  const generatedCell = worksheet.getCell('A2');
  generatedCell.value = `Generado: ${generatedAt.toLocaleString('es-ES')}`;
  generatedCell.font = { color: toExcelColor(EXPORT_COLORS.generatedText), size: 9, bold: false };

  const filterLabel = payload.filterLabel?.trim();
  if (filterLabel && columnCount > 1) {
    const filterCell = worksheet.getCell('B2');
    filterCell.value = `Filtros: ${filterLabel}`;
    filterCell.font = { color: toExcelColor(EXPORT_COLORS.generatedText), size: 9, bold: false };
  } else if (filterLabel) {
    generatedCell.value = `Generado: ${generatedAt.toLocaleString('es-ES')} · Filtros: ${filterLabel}`;
  }

  worksheet.getRow(3).height = 6;

  const headerRow = worksheet.getRow(4);
  payload.columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: toExcelColor(EXPORT_COLORS.headerBackground),
    };
    cell.font = { color: toExcelColor('#ffffff'), bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: toExcelColor(EXPORT_COLORS.headerBorder) } };
  });
  headerRow.height = 22;

  payload.rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(rowIndex + 5);
    const isOddDataRow = rowIndex % 2 === 0;
    const rowFillColor = isOddDataRow ? EXPORT_COLORS.dataBackground : EXPORT_COLORS.dataAlternateBackground;

    payload.columns.forEach((column, columnIndex) => {
      const value = column.value(row);
      const cell = excelRow.getCell(columnIndex + 1);
      const statusFillColor = getStatusFillColor(column.header, value);

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: toExcelColor(statusFillColor ?? rowFillColor),
      };
      cell.font = { color: toExcelColor(EXPORT_COLORS.dataText), size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
      cell.border = {
        bottom: { style: 'thin', color: toExcelColor(EXPORT_COLORS.dataBorder) },
      };

      if (value === null || value === undefined) {
        cell.value = null;
        return;
      }

      if (typeof value === 'number') {
        cell.value = value;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        return;
      }

      if (typeof value === 'string' && ISO_DATE_REGEX.test(value)) {
        cell.value = buildIsoDate(value);
        cell.numFmt = 'dd/mm/yyyy';
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        return;
      }

      cell.value = String(value);
    });

    excelRow.height = 18;
  });

  const lastRowNumber = Math.max(payload.rows.length + 4, 4);
  worksheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: lastRowNumber, column: columnCount },
  };

  payload.columns.forEach((column, columnIndex) => {
    const longestValueLength = payload.rows.reduce((maxLength, row) => {
      const value = column.value(row);
      return Math.max(maxLength, normalizeCellValue(value).length);
    }, 0);
    const width = Math.max(
      10,
      Math.min(Math.max(column.header.length, longestValueLength) + 4, 60),
    );
    worksheet.getColumn(columnIndex + 1).width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, buildStableExportFilename(payload.filename, generatedAt));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se ha podido abrir Excel.';
    console.error('Error al abrir Excel:', error);
    if (onAlert) {
      onAlert(message);
    } else {
      window.alert(message);
    }
  }
}
