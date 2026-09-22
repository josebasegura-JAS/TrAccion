import type { Task, TaskDraft } from '../domain/task';

interface TaskReportData {
  task: Task;
  draft: TaskDraft;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeXml(value: string): string {
  return escapeHtml(value).replaceAll('\n', '&#10;').replaceAll('\r', '');
}

function formatDate(value: string): string {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(parsed);
}

function formatDateTime(value: string | null): string {
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

export function printTaskReport({ task, draft }: TaskReportData): void {
  const seguimiento = task.seguimiento.length
    ? task.seguimiento
        .map(
          (entry) => `
            <div class="timeline-item">
              <div class="timeline-date">${escapeHtml(formatDateTime(entry.fechaHora))}</div>
              <div class="timeline-text">${escapeHtml(entry.texto).replaceAll('\n', '<br>')}</div>
            </div>`,
        )
        .join('')
    : '<div class="empty">Sin seguimientos registrados.</div>';

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Detalle de tarea - ${escapeHtml(draft.titulo)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #222; font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; background: #fff; }
  .report { max-width: 180mm; margin: 0 auto; }
  .topline { height: 5px; background: #c8102e; margin-bottom: 16px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 1px solid #d7d9dd; padding-bottom: 12px; }
  .eyebrow { color: #c8102e; font-size: 8pt; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; }
  h1 { margin: 5px 0 0; font-size: 19pt; line-height: 1.15; color: #17191d; }
  .meta { text-align: right; color: #62666d; font-size: 8.5pt; white-space: nowrap; }
  .status-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 14px 0; }
  .status { border: 1px solid #dadde1; border-radius: 7px; padding: 8px 9px; background: #f7f8fa; }
  .status span, .field-label { display: block; color: #6d7178; text-transform: uppercase; font-size: 7.5pt; font-weight: 700; letter-spacing: .5px; margin-bottom: 3px; }
  .status strong { color: #202328; font-size: 10pt; }
  .section { margin-top: 14px; page-break-inside: avoid; }
  .section-title { font-size: 10pt; font-weight: 700; color: #c8102e; border-bottom: 1px solid #e1e3e6; padding-bottom: 5px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: .5px; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 18px; }
  .field { min-height: 34px; }
  .field-value { font-weight: 600; color: #22252a; white-space: pre-wrap; }
  .text-box { border: 1px solid #e0e2e5; border-radius: 7px; padding: 10px; min-height: 46px; white-space: pre-wrap; line-height: 1.45; }
  .timeline-item { position: relative; padding: 0 0 10px 16px; margin-left: 4px; border-left: 2px solid #e2e4e7; page-break-inside: avoid; }
  .timeline-item:before { content: ''; position: absolute; left: -5px; top: 3px; width: 8px; height: 8px; border-radius: 50%; background: #c8102e; }
  .timeline-date { font-size: 8pt; font-weight: 700; color: #5d6168; margin-bottom: 3px; }
  .timeline-text { line-height: 1.45; white-space: pre-wrap; }
  .empty { color: #777b82; font-style: italic; }
  .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #dedfe2; color: #777b82; font-size: 7.5pt; display: flex; justify-content: space-between; }
  @media print { .report { max-width: none; } }
</style>
</head>
<body>
  <main class="report">
    <div class="topline"></div>
    <header class="header">
      <div>
        <div class="eyebrow">TrAccion · Relaciones Laborales</div>
        <h1>${escapeHtml(draft.titulo || 'Tarea sin título')}</h1>
      </div>
      <div class="meta">
        <div><strong>ID:</strong> ${escapeHtml(task.id)}</div>
        <div><strong>Actualizada:</strong> ${escapeHtml(formatDateTime(task.updatedAt))}</div>
      </div>
    </header>

    <section class="status-grid">
      <div class="status"><span>Estado</span><strong>${escapeHtml(label(draft.estado))}</strong></div>
      <div class="status"><span>Prioridad</span><strong>${escapeHtml(label(draft.prioridad))}</strong></div>
      <div class="status"><span>Tipo</span><strong>${escapeHtml(label(draft.tipo))}</strong></div>
      <div class="status"><span>Fase</span><strong>${escapeHtml(label(draft.fase))}</strong></div>
    </section>

    <section class="section">
      <div class="section-title">Datos de la tarea</div>
      <div class="fields">
        <div class="field"><span class="field-label">Responsable</span><div class="field-value">${escapeHtml(draft.responsable || '—')}</div></div>
        <div class="field"><span class="field-label">Fecha límite</span><div class="field-value">${escapeHtml(formatDate(draft.fechaLimite))}</div></div>
        <div class="field"><span class="field-label">Origen</span><div class="field-value">${escapeHtml(draft.origen || '—')}</div></div>
        <div class="field"><span class="field-label">Sindicato</span><div class="field-value">${escapeHtml(draft.sindicato || '—')}</div></div>
        <div class="field"><span class="field-label">Creada</span><div class="field-value">${escapeHtml(formatDateTime(task.createdAt))}</div></div>
        <div class="field"><span class="field-label">Cerrada</span><div class="field-value">${escapeHtml(formatDateTime(task.closedAt))}</div></div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Descripción</div>
      <div class="text-box">${escapeHtml(draft.descripcion || 'Sin descripción.')}</div>
    </section>

    <section class="section">
      <div class="section-title">Seguimiento</div>
      ${seguimiento}
    </section>

    <section class="section">
      <div class="section-title">Observaciones</div>
      <div class="text-box">${escapeHtml(draft.observaciones || 'Sin observaciones.')}</div>
    </section>

    <footer class="footer">
      <span>Informe de detalle de tarea</span>
      <span>Generado ${escapeHtml(formatDateTime(new Date().toISOString()))}</span>
    </footer>
  </main>
  <script>window.addEventListener('load', () => { window.print(); });</script>
</body>
</html>`;

  const reportWindow = window.open('', '_blank');
  if (!reportWindow) {
    throw new Error('No se ha podido abrir la vista de impresión.');
  }
  reportWindow.opener = null;
  reportWindow.document.open();
  reportWindow.document.write(html);
  reportWindow.document.close();
}

function excelCell(value: string, styleId = 'Body', mergeAcross?: number): string {
  const merge = mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : '';
  return `<Cell ss:StyleID="${styleId}"${merge}><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

export function exportTaskReportToExcel({ task, draft }: TaskReportData): void {
  const rows: string[] = [];
  const addRow = (...cells: string[]) => rows.push(`<Row>${cells.join('')}</Row>`);

  addRow(excelCell('TRACCION · RELACIONES LABORALES', 'Brand', 3));
  addRow(excelCell('DETALLE DE TAREA', 'Title', 3));
  addRow(excelCell(draft.titulo || 'Tarea sin título', 'TaskTitle', 3));
  addRow(excelCell('', 'Spacer', 3));

  addRow(
    excelCell('Estado', 'Header'),
    excelCell(label(draft.estado), 'Value'),
    excelCell('Prioridad', 'Header'),
    excelCell(label(draft.prioridad), 'Value'),
  );
  addRow(
    excelCell('Tipo', 'Header'),
    excelCell(label(draft.tipo), 'Value'),
    excelCell('Fase', 'Header'),
    excelCell(label(draft.fase), 'Value'),
  );
  addRow(
    excelCell('Responsable', 'Header'),
    excelCell(draft.responsable || '—', 'Value'),
    excelCell('Fecha límite', 'Header'),
    excelCell(formatDate(draft.fechaLimite), 'Value'),
  );
  addRow(
    excelCell('Origen', 'Header'),
    excelCell(draft.origen || '—', 'Value'),
    excelCell('Sindicato', 'Header'),
    excelCell(draft.sindicato || '—', 'Value'),
  );
  addRow(
    excelCell('Creada', 'Header'),
    excelCell(formatDateTime(task.createdAt), 'Value'),
    excelCell('Actualizada', 'Header'),
    excelCell(formatDateTime(task.updatedAt), 'Value'),
  );
  addRow(
    excelCell('Cerrada', 'Header'),
    excelCell(formatDateTime(task.closedAt), 'Value'),
    excelCell('ID', 'Header'),
    excelCell(task.id, 'Value'),
  );

  addRow(excelCell('', 'Spacer', 3));
  addRow(excelCell('DESCRIPCIÓN', 'Section', 3));
  addRow(excelCell(draft.descripcion || 'Sin descripción.', 'LongText', 3));
  addRow(excelCell('', 'Spacer', 3));
  addRow(excelCell('SEGUIMIENTO', 'Section', 3));
  addRow(excelCell('Fecha y hora', 'TableHeader'), excelCell('Detalle', 'TableHeader', 2));

  if (task.seguimiento.length === 0) {
    addRow(excelCell('—', 'Muted'), excelCell('Sin seguimientos registrados.', 'Muted', 2));
  } else {
    task.seguimiento.forEach((entry) => {
      addRow(
        excelCell(formatDateTime(entry.fechaHora), 'TimelineDate'),
        excelCell(entry.texto, 'LongText', 2),
      );
    });
  }

  addRow(excelCell('', 'Spacer', 3));
  addRow(excelCell('OBSERVACIONES', 'Section', 3));
  addRow(excelCell(draft.observaciones || 'Sin observaciones.', 'LongText', 3));
  addRow(excelCell('', 'Spacer', 3));
  addRow(
    excelCell(`Generado ${formatDateTime(new Date().toISOString())}`, 'Footer', 3),
  );

  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="10"/></Style>
  <Style ss:ID="Brand"><Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#C8102E"/><Alignment ss:Vertical="Center"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Title"><Font ss:FontName="Arial" ss:Size="18" ss:Bold="1" ss:Color="#202328"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="TaskTitle"><Font ss:FontName="Arial" ss:Size="13" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#C8102E" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/></Style>
  <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#5C6168"/><Interior ss:Color="#EEF0F2" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9DDE1"/></Borders></Style>
  <Style ss:ID="Value"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#202328"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E5E7E9"/></Borders><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="Section"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1" ss:Color="#C8102E"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9DDE1"/></Borders></Style>
  <Style ss:ID="TableHeader"><Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#3F434A" ss:Pattern="Solid"/><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="Body"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/></Style>
  <Style ss:ID="LongText"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:WrapText="1" ss:Vertical="Top"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E7E8EA"/></Borders></Style>
  <Style ss:ID="TimelineDate"><Font ss:FontName="Arial" ss:Size="9" ss:Bold="1" ss:Color="#5C6168"/><Alignment ss:Vertical="Top"/></Style>
  <Style ss:ID="Muted"><Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#7A7E84"/><Alignment ss:WrapText="1"/></Style>
  <Style ss:ID="Footer"><Font ss:FontName="Arial" ss:Size="8" ss:Color="#7A7E84"/><Alignment ss:Horizontal="Right"/></Style>
  <Style ss:ID="Spacer"><Font ss:FontName="Arial" ss:Size="5"/></Style>
 </Styles>
 <Worksheet ss:Name="Detalle tarea">
  <Table ss:DefaultRowHeight="18">
   <Column ss:Width="105"/><Column ss:Width="185"/><Column ss:Width="105"/><Column ss:Width="185"/>
   ${rows.join('\n   ')}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <PageSetup><Layout x:Orientation="Landscape"/><PageMargins x:Bottom="0.5" x:Left="0.4" x:Right="0.4" x:Top="0.5"/></PageSetup>
   <Print><FitWidth>1</FitWidth><ValidPrinterInfo/></Print>
   <Selected/>
   <FreezePanes/><FrozenNoSplit/><SplitHorizontal>3</SplitHorizontal><TopRowBottomPane>3</TopRowBottomPane><ActivePane>2</ActivePane>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;

  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `Tarea_${safeFileName(draft.titulo)}.xls`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
