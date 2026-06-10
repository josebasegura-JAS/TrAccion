import { escapeHtml } from '../export/tableExport';
import type { ExportCellValue, ExportTablePayload } from '../export/types';

function normalizeText(value: ExportCellValue): string {
  return String(value ?? '').trim();
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getBadgeClass(value: string): string | null {
  const normalized = normalizeForMatch(value);

  if (!normalized) {
    return null;
  }

  if (
    normalized.includes('pendiente de firma') ||
    normalized.includes('firma') ||
    normalized.includes('aprobado') ||
    normalized.includes('aprobada') ||
    normalized.includes('completado') ||
    normalized.includes('completada') ||
    normalized.includes('finalizado') ||
    normalized.includes('finalizada') ||
    normalized.includes('cerrado') ||
    normalized.includes('cerrada') ||
    normalized.includes('vigente')
  ) {
    return 'print-badge print-badge--success';
  }

  if (
    normalized.includes('enviada') ||
    normalized.includes('enviado') ||
    normalized.includes('direccion') ||
    normalized.includes('en curso') ||
    normalized.includes('tramitacion') ||
    normalized.includes('tramitación')
  ) {
    return 'print-badge print-badge--info';
  }

  if (
    normalized.includes('alegacion') ||
    normalized.includes('alegación') ||
    normalized.includes('pendiente') ||
    normalized.includes('revision') ||
    normalized.includes('revisión')
  ) {
    return 'print-badge print-badge--warning';
  }

  if (
    normalized.includes('redactar') ||
    normalized.includes('borrador') ||
    normalized.includes('alta') ||
    normalized.includes('media')
  ) {
    return 'print-badge print-badge--orange';
  }

  if (
    normalized.includes('vencido') ||
    normalized.includes('vencida') ||
    normalized.includes('denegado') ||
    normalized.includes('denegada') ||
    normalized.includes('critica') ||
    normalized.includes('crítica') ||
    normalized.includes('error')
  ) {
    return 'print-badge print-badge--danger';
  }

  if (normalized.includes('baja') || normalized.includes('informativo') || normalized.includes('tratado')) {
    return 'print-badge print-badge--muted';
  }

  return null;
}

function renderCell(value: ExportCellValue, header: string): string {
  const text = normalizeText(value);
  const normalizedHeader = normalizeForMatch(header);
  const shouldTryBadge =
    normalizedHeader.includes('estado') ||
    normalizedHeader.includes('prioridad') ||
    normalizedHeader.includes('situacion') ||
    normalizedHeader.includes('situación') ||
    normalizedHeader.includes('tipo');
  const badgeClass = shouldTryBadge ? getBadgeClass(text) : null;

  if (badgeClass) {
    return `<td><span class="${badgeClass}">${escapeHtml(text)}</span></td>`;
  }

  return `<td>${escapeHtml(text)}</td>`;
}

function buildSummaryCards(filterLabel: string | undefined, generatedAt: Date, rowCount: number): string {
  const cards = [
    { label: 'Fecha de impresión', value: generatedAt.toLocaleDateString('es-ES') },
    { label: 'Hora', value: generatedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) },
    { label: 'Registros', value: `${rowCount}` },
  ];

  if (filterLabel) {
    cards.push({ label: 'Filtros aplicados', value: filterLabel });
  }

  return cards
    .map(
      (card) => `
        <section class="print-summary-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </section>
      `,
    )
    .join('');
}

export function buildPrintableTableHtml<T>(payload: ExportTablePayload<T>): string {
  const generatedAt = payload.generatedAt ?? new Date();
  const filterLabel = payload.filterLabel?.trim();
  const headers = payload.columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join('');
  const rows = payload.rows
    .map((row, index) => {
      const cells = payload.columns.map((column) => renderCell(column.value(row), column.header)).join('');
      return `<tr><td class="print-row-number">${index + 1}</td>${cells}</tr>`;
    })
    .join('');

  return `
    <article class="print-document">
      <header class="print-report-header">
        <div>
          <p class="print-eyebrow">Informe de impresión</p>
          <h1>${escapeHtml(payload.title)}</h1>
        </div>
        <div class="print-header-pill">${escapeHtml(generatedAt.toLocaleDateString('es-ES'))}</div>
      </header>

      <section class="print-summary-grid">
        ${buildSummaryCards(filterLabel, generatedAt, payload.rows.length)}
      </section>

      <section class="print-table-section">
        <div class="print-section-title">
          <span class="print-section-icon">☰</span>
          <h2>Detalle</h2>
        </div>
        <table class="print-table">
          <thead><tr><th class="print-row-number-heading">Nº</th>${headers}</tr></thead>
          <tbody>${rows || '<tr><td colspan="99" class="print-empty">No hay registros para imprimir.</td></tr>'}</tbody>
        </table>
      </section>

      <footer class="print-footer">
        <span>Documento generado desde la aplicación RRLL.</span>
        <span>Página <span class="print-page-number"></span></span>
      </footer>
    </article>
  `;
}
