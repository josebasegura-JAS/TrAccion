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
  return `${sanitized}-${formatExportDate(generatedAt)}.xls`;
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

export function exportTableToExcel<T>(payload: ExportTablePayload<T>): void {
  const generatedAt = payload.generatedAt ?? new Date();
  const html = buildExcelTableHtml({ ...payload, generatedAt });
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildStableExportFilename(payload.filename, generatedAt);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
