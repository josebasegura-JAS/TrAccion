import { copyFile, mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getOpenTasksWordDirectory } from './taskOpenWordPreferences.js';

export interface TaskWordRecord {
  value: string;
}

export interface TaskWordExportResult {
  ok: boolean;
  skipped?: boolean;
  path: string | null;
  count: number;
  message: string;
}

interface TaskTrackingEntry {
  fechaHora: string;
  texto: string;
}

interface ExportableTrackingEntry {
  fechaHora: string;
  fecha: string;
  usuario: string;
  texto: string;
}

interface ExportableTask {
  titulo: string;
  tipo: string;
  fase: string;
  estado: string;
  prioridad: string;
  fechaLimite: string;
  sindicato: string;
  createdAt: string;
  seguimiento: ExportableTrackingEntry[];
  deletedAt?: string | null;
}

const TRACKING_META_PREFIX = '[[traccion-seguimiento:';
const TRACKING_META_SUFFIX = ']]';

const PRIORITY_ORDER: Record<string, number> = {
  critica: 0,
  alta: 1,
  media: 2,
  baja: 3,
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeDate(value: string): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function normalizeDateTime(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return normalizeDate(value) || value;
  }

  return parsed.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function decodeTrackingEntry(entry: TaskTrackingEntry): ExportableTrackingEntry {
  const rawText = typeof entry.texto === 'string' ? entry.texto : '';
  const fallbackDate = normalizeDateTime(entry.fechaHora);

  if (!rawText.startsWith(TRACKING_META_PREFIX)) {
    return {
      fechaHora: entry.fechaHora,
      fecha: fallbackDate,
      usuario: '',
      texto: rawText.trim(),
    };
  }

  const metadataEnd = rawText.indexOf(TRACKING_META_SUFFIX);
  if (metadataEnd < 0) {
    return {
      fechaHora: entry.fechaHora,
      fecha: fallbackDate,
      usuario: '',
      texto: rawText.trim(),
    };
  }

  const metadataRaw = rawText.slice(TRACKING_META_PREFIX.length, metadataEnd);
  const visibleText = rawText
    .slice(metadataEnd + TRACKING_META_SUFFIX.length)
    .replace(/^\s*\n?/, '')
    .trim();

  try {
    const metadata = JSON.parse(metadataRaw) as { fecha?: unknown; usuario?: unknown };
    const metadataDate = typeof metadata.fecha === 'string' ? metadata.fecha : '';
    const metadataUser = typeof metadata.usuario === 'string' ? metadata.usuario.trim() : '';

    return {
      fechaHora: entry.fechaHora,
      fecha: metadataDate ? normalizeDate(metadataDate) || metadataDate : fallbackDate,
      usuario: metadataUser,
      texto: visibleText,
    };
  } catch {
    return {
      fechaHora: entry.fechaHora,
      fecha: fallbackDate,
      usuario: '',
      texto: visibleText || rawText.trim(),
    };
  }
}

function parseTracking(value: unknown): ExportableTrackingEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is TaskTrackingEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<TaskTrackingEntry>;
      return typeof candidate.fechaHora === 'string' && typeof candidate.texto === 'string';
    })
    .map(decodeTrackingEntry)
    .filter((entry) => entry.texto.length > 0)
    .sort((first, second) => second.fechaHora.localeCompare(first.fechaHora));
}

function parseTask(value: string): ExportableTask | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const task = parsed as Partial<ExportableTask> & { seguimiento?: unknown };

    if (typeof task.titulo !== 'string') return null;
    if (task.deletedAt) return null;
    if (task.estado === 'cerrada' || task.fase?.trim().toLowerCase() === 'cerrada') return null;

    return {
      titulo: task.titulo,
      tipo: task.tipo ?? '',
      fase: task.fase ?? '',
      estado: task.estado ?? '',
      prioridad: task.prioridad ?? '',
      fechaLimite: task.fechaLimite ?? '',
      sindicato: task.sindicato ?? '',
      createdAt: task.createdAt ?? '',
      seguimiento: parseTracking(task.seguimiento),
      deletedAt: task.deletedAt ?? null,
    };
  } catch {
    return null;
  }
}

function sortTasks(tasks: ExportableTask[]): ExportableTask[] {
  return [...tasks].sort((a, b) => {
    const priority =
      (PRIORITY_ORDER[a.prioridad] ?? 99) - (PRIORITY_ORDER[b.prioridad] ?? 99);
    if (priority !== 0) return priority;

    const aDate = a.fechaLimite || '9999-12-31';
    const bDate = b.fechaLimite || '9999-12-31';
    const dateComparison = aDate.localeCompare(bDate);
    if (dateComparison !== 0) return dateComparison;

    return a.titulo.localeCompare(b.titulo, 'es', { sensitivity: 'base' });
  });
}

function priorityStyle(priority: string): string {
  switch (priority) {
    case 'critica':
      return 'background:#fde8e8;color:#9b1c1c;font-weight:700;';
    case 'alta':
      return 'background:#fff1e6;color:#9a3412;font-weight:700;';
    case 'media':
      return 'background:#fff8db;color:#854d0e;font-weight:700;';
    case 'baja':
      return 'background:#e8f7ee;color:#166534;font-weight:700;';
    default:
      return '';
  }
}

function stateStyle(state: string): string {
  switch (state) {
    case 'pendiente':
      return 'background:#fff8db;color:#854d0e;';
    case 'en curso':
      return 'background:#e8f2ff;color:#1d4ed8;';
    case 'bloqueada':
      return 'background:#fde8e8;color:#9b1c1c;';
    case 'resuelta':
      return 'background:#e8f7ee;color:#166534;';
    default:
      return '';
  }
}

function buildTrackingRow(task: ExportableTask): string {
  if (task.seguimiento.length === 0) {
    return '';
  }

  const items = task.seguimiento
    .map((entry) => {
      const meta = [entry.fecha, entry.usuario].filter(Boolean).join(' · ');
      return `<div class="tracking-item">
  <span class="tracking-meta">${escapeHtml(meta || 'Seguimiento')}</span>
  <span class="tracking-text">${escapeHtml(entry.texto)}</span>
</div>`;
    })
    .join('');

  return `<tr class="tracking-row">
<td colspan="8">
  <div class="tracking-wrapper">
    <div class="tracking-heading">Seguimiento (${task.seguimiento.length})</div>
    ${items}
  </div>
</td>
</tr>`;
}

function buildTaskRows(task: ExportableTask): string {
  return `<tr class="task-row">
<td>${escapeHtml(normalizeDate(task.createdAt))}</td>
<td class="title">${escapeHtml(task.titulo)}</td>
<td>${escapeHtml(task.tipo)}</td>
<td>${escapeHtml(task.fase)}</td>
<td style="${stateStyle(task.estado)}">${escapeHtml(task.estado)}</td>
<td style="${priorityStyle(task.prioridad)}">${escapeHtml(task.prioridad)}</td>
<td>${escapeHtml(normalizeDate(task.fechaLimite))}</td>
<td>${escapeHtml(task.sindicato || '—')}</td>
</tr>
${buildTrackingRow(task)}`;
}

function buildWordHtml(tasks: ExportableTask[]): string {
  const generatedAt = new Date().toLocaleString('es-ES');
  const rows = tasks.map(buildTaskRows).join('\n');

  const emptyRow =
    '<tr><td colspan="8" class="empty">No hay tareas abiertas.</td></tr>';

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="TrAccion">
<style>
@page Section1 {
  size: 841.9pt 595.3pt;
  mso-page-orientation: landscape;
  margin: 28.35pt 28.35pt 28.35pt 28.35pt;
}
div.Section1 { page: Section1; }
body { font-family: Calibri, Arial, sans-serif; color:#172033; font-size:9pt; }
h1 { font-size:18pt; margin:0 0 4pt 0; color:#17365d; }
.meta { color:#64748b; margin:0 0 12pt 0; font-size:9pt; }
table { border-collapse:collapse; width:100%; table-layout:fixed; }
th {
  background:#17365d;
  color:white;
  border:1px solid #b9c5d4;
  padding:5pt 4pt;
  font-size:8.5pt;
  text-align:left;
}
td {
  border:1px solid #cbd5e1;
  padding:4pt;
  vertical-align:top;
  word-wrap:break-word;
}
.task-row:nth-of-type(4n+3) td { background-color:#f7f9fc; }
td.title { font-weight:600; }
.empty { text-align:center; color:#64748b; padding:14pt; }
.col-date { width:9%; }
.col-title { width:27%; }
.col-small { width:9%; }
.col-medium { width:11%; }
.tracking-row td {
  padding:0;
  background:#f8fafc;
  border-top:0;
  border-bottom:2px solid #9fb2c7;
}
.tracking-wrapper {
  padding:5pt 7pt 6pt 7pt;
  background:#f8fafc;
}
.tracking-heading {
  margin-bottom:3pt;
  color:#17365d;
  font-size:8pt;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.3pt;
}
.tracking-item {
  margin:2pt 0 0 0;
  padding:3pt 5pt;
  border-left:2pt solid #8ba9c7;
  background:#ffffff;
}
.tracking-meta {
  display:block;
  margin-bottom:1pt;
  color:#64748b;
  font-size:7.5pt;
  font-weight:700;
}
.tracking-text {
  display:block;
  color:#26364a;
  font-size:8.5pt;
  line-height:1.2;
}
</style>
</head>
<body>
<div class="Section1">
  <h1>Tareas abiertas</h1>
  <p class="meta">${tasks.length} tarea${tasks.length === 1 ? '' : 's'} · Actualizado ${escapeHtml(generatedAt)}</p>
  <table>
    <thead>
      <tr>
        <th class="col-date">Fecha creación</th>
        <th class="col-title">Título</th>
        <th class="col-small">Tipo</th>
        <th class="col-medium">Fase</th>
        <th class="col-medium">Estado</th>
        <th class="col-small">Prioridad</th>
        <th class="col-date">Fecha límite</th>
        <th class="col-medium">Origen</th>
      </tr>
    </thead>
    <tbody>${rows || emptyRow}</tbody>
  </table>
</div>
</body>
</html>`;
}

export async function exportOpenTasksWord(
  records: TaskWordRecord[],
): Promise<TaskWordExportResult> {
  const directoryPath = await getOpenTasksWordDirectory();
  if (!directoryPath) {
    return {
      ok: true,
      skipped: true,
      path: null,
      count: 0,
      message: 'No hay carpeta configurada para el Word de tareas abiertas.',
    };
  }

  const tasks = sortTasks(
    records
      .map((record) => parseTask(record.value))
      .filter((task): task is ExportableTask => task !== null),
  );

  const finalPath = path.join(directoryPath, 'Tareas abiertas.doc');
  const tempPath = path.join(
    directoryPath,
    `.Tareas abiertas.${process.pid}.${Date.now()}.tmp.doc`,
  );

  try {
    await mkdir(directoryPath, { recursive: true });
    const html = buildWordHtml(tasks);
    await writeFile(tempPath, Buffer.from(`\uFEFF${html}`, 'utf8'));
    await copyFile(tempPath, finalPath);
    await unlink(tempPath).catch(() => undefined);
    return {
      ok: true,
      path: finalPath,
      count: tasks.length,
      message: `Word actualizado correctamente (${tasks.length} tareas abiertas).`,
    };
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    return {
      ok: false,
      path: finalPath,
      count: tasks.length,
      message:
        `La tarea se ha guardado, pero no se ha podido actualizar el Word compartido: ${
          error instanceof Error ? error.message : String(error)
        }`,
    };
  }
}
