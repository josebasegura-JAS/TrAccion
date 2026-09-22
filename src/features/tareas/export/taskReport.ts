import type { Task, TaskDraft, TaskSeguimientoEntry } from '../domain/task';
import { openWorkbookInExcel } from '../../../shared/export/tableExport';

interface TaskReportData {
  task: Task;
  draft: TaskDraft;
}

const TRACKING_META_PREFIX = '[[traccion-seguimiento:';
const TRACKING_META_SUFFIX = ']]';

type TrackingMeta = { fecha?: string; usuario?: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value: string): string {
  if (!value) return '—';
  const normalized = value.length === 10 ? `${value}T00:00:00` : value;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(parsed);
}

function label(value: string): string {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function safeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'tarea';
}

function decodeTracking(entry: TaskSeguimientoEntry): { text: string; date: string; user: string } {
  const text = entry.texto ?? '';
  if (!text.startsWith(TRACKING_META_PREFIX)) {
    return { text, date: entry.fechaHora, user: '—' };
  }

  const end = text.indexOf(TRACKING_META_SUFFIX);
  if (end < 0) {
    return { text, date: entry.fechaHora, user: '—' };
  }

  const raw = text.slice(TRACKING_META_PREFIX.length, end);
  try {
    const parsed = JSON.parse(raw) as TrackingMeta;
    return {
      text: text.slice(end + TRACKING_META_SUFFIX.length).replace(/^\s*\n?/, ''),
      date: parsed.fecha || entry.fechaHora,
      user: parsed.usuario || '—',
    };
  } catch {
    return { text, date: entry.fechaHora, user: '—' };
  }
}

function estimateRowHeight(text: string, charsPerLine: number, minimum = 22): number {
  const normalized = text || '';
  const explicitLines = normalized.split(/\r?\n/);
  const lines = explicitLines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
  return Math.max(minimum, Math.min(180, 8 + lines * 15));
}

export function buildTaskReportHtml({ task, draft }: TaskReportData): string {
  const trackingRows = task.seguimiento.length
    ? task.seguimiento
        .map((entry) => {
          const decoded = decodeTracking(entry);
          return `<tr>
            <td>${escapeHtml(formatDate(decoded.date))}</td>
            <td>${escapeHtml(decoded.user)}</td>
            <td>${escapeHtml(decoded.text || '—')}</td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="3" class="task-report-empty">Sin seguimientos registrados.</td></tr>';

  return `<style>
.task-report-title{margin:0;font-size:26px;line-height:1.15;color:#fff;text-transform:none!important}
.task-report-subtitle{margin:7px 0 0;color:#dbeafe;font-size:13px;font-weight:600}
.task-report-section{padding:8px 34px 18px}
.task-report-section h2{margin:0 0 9px;padding-bottom:6px;border-bottom:1px solid #dbe3ef;color:#c8102e;font-size:13px;letter-spacing:.04em;text-transform:uppercase}
.task-report-text{margin:0;border:1px solid #dbe3ef;border-radius:12px;background:#fff;padding:12px 14px;white-space:pre-wrap;line-height:1.5;font-size:11px;min-height:44px}
.task-report-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:20px 34px 12px}
.task-report-card{border:1px solid #dbe3ef;border-radius:12px;background:#f8fafc;padding:10px 12px;min-height:60px}
.task-report-card span{display:block;color:#64748b;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.task-report-card strong{display:block;color:#0f172a;font-size:11px;line-height:1.35;white-space:pre-wrap}
.task-report-table{width:100%;border-collapse:collapse;border:1px solid #dbe3ef;border-radius:12px;overflow:hidden;font-size:10.5px}
.task-report-table th{background:#343a40;color:#fff;text-align:left;padding:8px 9px;font-size:9px;text-transform:uppercase;letter-spacing:.04em}
.task-report-table td{border-top:1px solid #e5e7eb;padding:8px 9px;vertical-align:top;white-space:pre-wrap;line-height:1.4}
.task-report-table tbody tr:nth-child(even) td{background:#f8fafc}
.task-report-table th:nth-child(1),.task-report-table td:nth-child(1){width:16%}
.task-report-table th:nth-child(2),.task-report-table td:nth-child(2){width:18%}
.task-report-empty{text-align:center!important;color:#64748b;font-style:italic;padding:18px!important}
@media print{
 .task-report-grid{padding:14px 24px 8px;gap:7px}
 .task-report-section{padding:6px 24px 12px}
 .task-report-card{min-height:48px;padding:8px 9px}
 .task-report-text{padding:9px 10px}
 .task-report-table th,.task-report-table td{padding:6px 7px}
}
</style>
<article class="print-document">
  <header class="print-report-header">
    <div>
      <p class="print-eyebrow">TrAccion · Relaciones Laborales</p>
      <h1 class="task-report-title">Detalle de tarea</h1>
      <p class="task-report-subtitle">${escapeHtml(draft.titulo || 'Tarea sin título')}</p>
    </div>
    <div class="print-header-pill">${escapeHtml(label(draft.estado))}</div>
  </header>

  <section class="task-report-grid">
    <div class="task-report-card"><span>Estado</span><strong>${escapeHtml(label(draft.estado))}</strong></div>
    <div class="task-report-card"><span>Prioridad</span><strong>${escapeHtml(label(draft.prioridad))}</strong></div>
    <div class="task-report-card"><span>Tipo</span><strong>${escapeHtml(label(draft.tipo))}</strong></div>
    <div class="task-report-card"><span>Fase</span><strong>${escapeHtml(label(draft.fase))}</strong></div>
    <div class="task-report-card"><span>Responsable</span><strong>${escapeHtml(draft.responsable || '—')}</strong></div>
    <div class="task-report-card"><span>Fecha límite</span><strong>${escapeHtml(formatDate(draft.fechaLimite))}</strong></div>
    <div class="task-report-card"><span>Origen</span><strong>${escapeHtml(draft.origen || '—')}</strong></div>
    <div class="task-report-card"><span>Sindicato</span><strong>${escapeHtml(draft.sindicato || '—')}</strong></div>
    <div class="task-report-card"><span>Creada</span><strong>${escapeHtml(formatDateTime(task.createdAt))}</strong></div>
    <div class="task-report-card"><span>Actualizada</span><strong>${escapeHtml(formatDateTime(task.updatedAt))}</strong></div>
    <div class="task-report-card"><span>Cerrada</span><strong>${escapeHtml(formatDateTime(task.closedAt))}</strong></div>
    <div class="task-report-card"><span>ID</span><strong>${escapeHtml(task.id)}</strong></div>
  </section>

  <section class="task-report-section">
    <h2>Descripción</h2>
    <p class="task-report-text">${escapeHtml(draft.descripcion || 'Sin descripción.')}</p>
  </section>

  <section class="task-report-section">
    <h2>Seguimiento</h2>
    <table class="task-report-table">
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Detalle</th></tr></thead>
      <tbody>${trackingRows}</tbody>
    </table>
  </section>

  <section class="task-report-section">
    <h2>Observaciones</h2>
    <p class="task-report-text">${escapeHtml(draft.observaciones || 'Sin observaciones.')}</p>
  </section>

  <footer class="print-footer">
    <span>Informe de detalle de tarea</span>
    <span>Generado ${escapeHtml(formatDateTime(new Date().toISOString()))}</span>
  </footer>
</article>`;
}

export async function exportTaskReportToExcel({ task, draft }: TaskReportData): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const generatedAt = new Date();
  workbook.creator = 'TrAccion';
  workbook.created = generatedAt;
  workbook.modified = generatedAt;

  const sheet = workbook.addWorksheet('Detalle tarea', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    },
  });

  const red = 'FFE30613';
  const redDark = 'FFB20B16';
  const dark = 'FF202328';
  const muted = 'FF5C6168';
  const light = 'FFF1F3F5';
  const border = 'FFD9DDE1';
  const white = 'FFFFFFFF';
  const headerDark = 'FF3F434A';

  sheet.columns = [
    { width: 20 },
    { width: 30 },
    { width: 20 },
    { width: 44 },
  ];

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: border } },
    bottom: { style: 'thin' as const, color: { argb: border } },
    left: { style: 'thin' as const, color: { argb: border } },
    right: { style: 'thin' as const, color: { argb: border } },
  };

  const mergeValueRow = (rowNumber: number, value: string, height: number) => {
    sheet.mergeCells(rowNumber, 1, rowNumber, 4);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = value;
    cell.font = { name: 'Arial', size: 10, color: { argb: dark } };
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = thinBorder;
    sheet.getRow(rowNumber).height = height;
  };

  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'TRACCION · RELACIONES LABORALES';
  sheet.getCell('A1').font = { name: 'Arial', size: 9, bold: true, color: { argb: redDark } };
  sheet.getRow(1).height = 18;

  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = 'DETALLE DE TAREA';
  sheet.getCell('A2').font = { name: 'Arial', size: 18, bold: true, color: { argb: dark } };
  sheet.getRow(2).height = 28;

  sheet.mergeCells('A3:D3');
  sheet.getCell('A3').value = draft.titulo || 'Tarea sin título';
  sheet.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: red } };
  sheet.getCell('A3').font = { name: 'Arial', size: 12, bold: true, color: { argb: white } };
  sheet.getCell('A3').alignment = { vertical: 'middle', wrapText: true };
  sheet.getRow(3).height = estimateRowHeight(draft.titulo, 95, 28);

  const pairs: Array<[string, string, string, string]> = [
    ['Estado', label(draft.estado), 'Prioridad', label(draft.prioridad)],
    ['Tipo', label(draft.tipo), 'Fase', label(draft.fase)],
    ['Responsable', draft.responsable || '—', 'Fecha límite', formatDate(draft.fechaLimite)],
    ['Origen', draft.origen || '—', 'Sindicato', draft.sindicato || '—'],
    ['Creada', formatDateTime(task.createdAt), 'Actualizada', formatDateTime(task.updatedAt)],
    ['Cerrada', formatDateTime(task.closedAt), 'ID', task.id],
  ];

  let rowNumber = 5;
  pairs.forEach(([labelA, valueA, labelB, valueB]) => {
    const row = sheet.getRow(rowNumber);
    row.values = [labelA, valueA, labelB, valueB];
    [1, 3].forEach((column) => {
      const cell = row.getCell(column);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: light } };
      cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: muted } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    [2, 4].forEach((column) => {
      const cell = row.getCell(column);
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: dark } };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.height = Math.max(20, estimateRowHeight(`${valueA} ${valueB}`, 60, 20));
    rowNumber += 1;
  });

  rowNumber += 1;
  sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  sheet.getCell(rowNumber, 1).value = 'DESCRIPCIÓN';
  sheet.getCell(rowNumber, 1).font = { name: 'Arial', size: 10, bold: true, color: { argb: redDark } };
  rowNumber += 1;
  mergeValueRow(rowNumber, draft.descripcion || 'Sin descripción.', estimateRowHeight(draft.descripcion, 100, 34));

  rowNumber += 2;
  sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  sheet.getCell(rowNumber, 1).value = 'SEGUIMIENTO';
  sheet.getCell(rowNumber, 1).font = { name: 'Arial', size: 10, bold: true, color: { argb: redDark } };
  rowNumber += 1;

  const trackingHeader = sheet.getRow(rowNumber);
  trackingHeader.values = ['Fecha', 'Usuario', 'Detalle', ''];
  sheet.mergeCells(rowNumber, 3, rowNumber, 4);
  [1, 2, 3].forEach((column) => {
    const cell = trackingHeader.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerDark } };
    cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: white } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    cell.border = thinBorder;
  });
  trackingHeader.height = 22;
  rowNumber += 1;

  if (task.seguimiento.length === 0) {
    sheet.mergeCells(rowNumber, 1, rowNumber, 4);
    const cell = sheet.getCell(rowNumber, 1);
    cell.value = 'Sin seguimientos registrados.';
    cell.font = { name: 'Arial', size: 9, italic: true, color: { argb: muted } };
    cell.alignment = { vertical: 'middle' };
    cell.border = thinBorder;
    sheet.getRow(rowNumber).height = 22;
    rowNumber += 1;
  } else {
    task.seguimiento.forEach((entry) => {
      const decoded = decodeTracking(entry);
      const row = sheet.getRow(rowNumber);
      row.getCell(1).value = formatDate(decoded.date);
      row.getCell(2).value = decoded.user;
      row.getCell(3).value = decoded.text || '—';
      sheet.mergeCells(rowNumber, 3, rowNumber, 4);
      [1, 2, 3].forEach((column) => {
        const cell = row.getCell(column);
        cell.font = { name: 'Arial', size: column === 1 ? 9 : 10, color: { argb: column === 1 ? muted : dark }, bold: column === 1 };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border = thinBorder;
      });
      row.height = estimateRowHeight(decoded.text, 65, 24);
      rowNumber += 1;
    });
  }

  rowNumber += 1;
  sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  sheet.getCell(rowNumber, 1).value = 'OBSERVACIONES';
  sheet.getCell(rowNumber, 1).font = { name: 'Arial', size: 10, bold: true, color: { argb: redDark } };
  rowNumber += 1;
  mergeValueRow(rowNumber, draft.observaciones || 'Sin observaciones.', estimateRowHeight(draft.observaciones, 100, 34));

  rowNumber += 2;
  sheet.mergeCells(rowNumber, 1, rowNumber, 4);
  const footer = sheet.getCell(rowNumber, 1);
  footer.value = `Generado ${formatDateTime(generatedAt.toISOString())}`;
  footer.font = { name: 'Arial', size: 8, color: { argb: muted } };
  footer.alignment = { horizontal: 'right' };

  sheet.pageSetup.printArea = `A1:D${rowNumber}`;
  sheet.headerFooter.oddFooter = '&LTrAccion · Detalle de tarea&C&P / &N';

  const buffer = await workbook.xlsx.writeBuffer();
  await openWorkbookInExcel(buffer, `Tarea_${safeFileName(draft.titulo)}.xlsx`);
}
