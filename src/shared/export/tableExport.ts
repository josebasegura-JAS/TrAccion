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

function toExcelColor(hex: string): { argb: string } {
  return { argb: `FF${hex.replace('#', '').toUpperCase()}` };
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

async function openWorkbookInExcel(
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

  const worksheet = workbook.addWorksheet(buildWorksheetName(payload.filename), {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const columnCount = Math.max(payload.columns.length, 1);
  const lastColumnLetter = worksheet.getColumn(columnCount).letter;

  worksheet.mergeCells(`A1:${lastColumnLetter}1`);
  const titleCell = worksheet.getCell('A1');
  titleCell.value = payload.title;
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: toExcelColor('#1f2937'),
  };
  titleCell.font = { color: toExcelColor('#ffffff'), bold: true, size: 13 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  const generatedCell = worksheet.getCell('A2');
  generatedCell.value = `Generado: ${generatedAt.toLocaleString('es-ES')}`;
  generatedCell.font = { color: toExcelColor('#94a3b8'), size: 9, bold: false };

  const filterLabel = payload.filterLabel?.trim();
  if (filterLabel && columnCount > 1) {
    const filterCell = worksheet.getCell('B2');
    filterCell.value = `Filtros: ${filterLabel}`;
    filterCell.font = { color: toExcelColor('#94a3b8'), size: 9, bold: false };
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
      fgColor: toExcelColor('#dc2626'),
    };
    cell.font = { color: toExcelColor('#ffffff'), bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: toExcelColor('#991b1b') } };
  });
  headerRow.height = 22;

  payload.rows.forEach((row, rowIndex) => {
    const excelRow = worksheet.getRow(rowIndex + 5);
    const isOddDataRow = rowIndex % 2 === 0;
    const fillColor = toExcelColor(isOddDataRow ? '#1f2937' : '#111827');

    payload.columns.forEach((column, columnIndex) => {
      const value = column.value(row);
      const cell = excelRow.getCell(columnIndex + 1);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: fillColor };
      cell.font = { color: toExcelColor('#e5e7eb'), size: 10 };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };

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
