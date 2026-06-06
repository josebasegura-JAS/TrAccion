import { escapeHtml } from '../export/tableExport';
import type { ExportTablePayload } from '../export/types';

export function buildPrintableTableHtml<T>(payload: ExportTablePayload<T>): string {
  const generatedAt = payload.generatedAt ?? new Date();
  const filterLabel = payload.filterLabel?.trim();
  const headers = payload.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('');
  const rows = payload.rows
    .map((row) => {
      const cells = payload.columns
        .map((column) => `<td>${escapeHtml(column.value(row))}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `
    <article class="print-document">
      <header class="print-header">
        <h1>${escapeHtml(payload.title)}</h1>
        <p>Generado: ${escapeHtml(generatedAt.toLocaleString('es-ES'))}</p>
        ${filterLabel ? `<p>Filtros aplicados: ${escapeHtml(filterLabel)}</p>` : ''}
        <p>${payload.rows.length} registros</p>
      </header>
      <table>
        <thead><tr>${headers}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </article>
  `;
}
