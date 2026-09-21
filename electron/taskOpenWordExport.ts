import ExcelJS from 'exceljs';
import { copyFile, mkdir, readdir, unlink } from 'node:fs/promises';
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
  usuario: string;
  texto: string;
}

interface ExportableTask {
  id: string;
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

const PRIORITY_LABELS: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const STATE_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  'en curso': 'En curso',
  bloqueada: 'Bloqueada',
  resuelta: 'Resuelta',
  cerrada: 'Cerrada',
};

const PRIORITY_COLORS: Record<string, { fill: string; font: string }> = {
  critica: { fill: 'FDE8E8', font: '9B1C1C' },
  alta: { fill: 'FFF1E6', font: '9A3412' },
  media: { fill: 'FFF8DB', font: '854D0E' },
  baja: { fill: 'E8F7EE', font: '166534' },
};

const STATE_COLORS: Record<string, { fill: string; font: string }> = {
  pendiente: { fill: 'FFF8DB', font: '854D0E' },
  'en curso': { fill: 'E8F2FF', font: '1D4ED8' },
  bloqueada: { fill: 'FDE8E8', font: '9B1C1C' },
  resuelta: { fill: 'E8F7EE', font: '166534' },
};

function decodeTrackingEntry(entry: TaskTrackingEntry): ExportableTrackingEntry {
  const rawText = typeof entry.texto === 'string' ? entry.texto : '';

  if (!rawText.startsWith(TRACKING_META_PREFIX)) {
    return {
      fechaHora: entry.fechaHora,
      usuario: '',
      texto: rawText.trim(),
    };
  }

  const metadataEnd = rawText.indexOf(TRACKING_META_SUFFIX);
  if (metadataEnd < 0) {
    return {
      fechaHora: entry.fechaHora,
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
    const metadata = JSON.parse(metadataRaw) as { usuario?: unknown };
    return {
      fechaHora: entry.fechaHora,
      usuario: typeof metadata.usuario === 'string' ? metadata.usuario.trim() : '',
      texto: visibleText,
    };
  } catch {
    return {
      fechaHora: entry.fechaHora,
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

    const task = parsed as Partial<ExportableTask> & {
      id?: unknown;
      seguimiento?: unknown;
    };

    if (typeof task.titulo !== 'string') return null;
    if (task.deletedAt) return null;
    if (task.estado === 'cerrada' || task.fase?.trim().toLowerCase() === 'cerrada') return null;

    return {
      id: typeof task.id === 'string' ? task.id : '',
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
  return [...tasks].sort((first, second) => {
    const priority =
      (PRIORITY_ORDER[first.prioridad] ?? 99) - (PRIORITY_ORDER[second.prioridad] ?? 99);
    if (priority !== 0) return priority;

    const firstDate = first.fechaLimite || '9999-12-31';
    const secondDate = second.fechaLimite || '9999-12-31';
    const dateComparison = firstDate.localeCompare(secondDate);
    if (dateComparison !== 0) return dateComparison;

    return first.titulo.localeCompare(second.titulo, 'es', { sensitivity: 'base' });
  });
}

function parseDate(value: string): Date | null {
  if (!value) return null;

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return new Date(
      Number(dateOnlyMatch[1]),
      Number(dateOnlyMatch[2]) - 1,
      Number(dateOnlyMatch[3]),
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function setTitle(
  worksheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  lastColumn: number,
): void {
  worksheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = worksheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 18, color: { argb: 'FF17365D' } };
  titleCell.alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 28;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  const subtitleCell = worksheet.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { size: 10, color: { argb: 'FF64748B' } };
  worksheet.getRow(2).height = 18;
}

function setTableHeaderStyle(worksheet: ExcelJS.Worksheet, headerRowNumber: number): void {
  const row = worksheet.getRow(headerRowNumber);
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF17365D' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}

function applyTrackingGroupShading(
  worksheet: ExcelJS.Worksheet,
  rows: ExcelJS.CellValue[][],
  firstDataRow: number,
): void {
  if (rows.length === 0) return;

  const shadedFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFDDE6F1' },
  };

  const clearFill = {
    type: 'pattern' as const,
    pattern: 'solid' as const,
    fgColor: { argb: 'FFFFFFFF' },
  };

  let currentTask = String(rows[0]?.[0] ?? '');
  let shadedGroup = true;

  rows.forEach((rowValues, index) => {
    const taskTitle = String(rowValues[0] ?? '');
    if (index > 0 && taskTitle !== currentTask) {
      currentTask = taskTitle;
      shadedGroup = !shadedGroup;
    }

    const rowNumber = firstDataRow + index;
    for (let columnNumber = 1; columnNumber <= 5; columnNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.fill = shadedGroup ? shadedFill : clearFill;
    }
  });
}

function styleTaskRows(
  worksheet: ExcelJS.Worksheet,
  tasks: ExportableTask[],
  firstDataRow: number,
): void {
  tasks.forEach((task, index) => {
    const rowNumber = firstDataRow + index;
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: 'top', wrapText: true };

    const stateColor = STATE_COLORS[task.estado];
    if (stateColor) {
      const stateCell = worksheet.getCell(rowNumber, 5);
      stateCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${stateColor.fill}` },
      };
      stateCell.font = { bold: true, color: { argb: `FF${stateColor.font}` } };
    }

    const priorityColor = PRIORITY_COLORS[task.prioridad];
    if (priorityColor) {
      const priorityCell = worksheet.getCell(rowNumber, 6);
      priorityCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${priorityColor.fill}` },
      };
      priorityCell.font = { bold: true, color: { argb: `FF${priorityColor.font}` } };
    }
  });
}

function addTasksWorksheet(
  workbook: ExcelJS.Workbook,
  tasks: ExportableTask[],
  generatedAt: string,
): void {
  const worksheet = workbook.addWorksheet('Tareas abiertas', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  setTitle(
    worksheet,
    'Tareas abiertas',
    `${tasks.length} tarea${tasks.length === 1 ? '' : 's'} · Actualizado ${generatedAt}`,
    10,
  );

  const tableRows: ExcelJS.CellValue[][] = tasks.map((task) => [
    parseDate(task.createdAt),
    task.titulo,
    task.tipo,
    task.fase,
    STATE_LABELS[task.estado] ?? task.estado,
    PRIORITY_LABELS[task.prioridad] ?? task.prioridad,
    parseDate(task.fechaLimite),
    task.sindicato || '',
    task.seguimiento.length,
    task.id,
  ]);

  worksheet.addTable({
    name: 'TareasAbiertasTable',
    ref: 'A4',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: true,
      showColumnStripes: false,
    },
    columns: [
      { name: 'Fecha creación', filterButton: true },
      { name: 'Título', filterButton: true },
      { name: 'Tipo', filterButton: true },
      { name: 'Fase', filterButton: true },
      { name: 'Estado', filterButton: true },
      { name: 'Prioridad', filterButton: true },
      { name: 'Fecha límite', filterButton: true },
      { name: 'Origen', filterButton: true },
      { name: 'Nº seguimientos', filterButton: true },
      { name: 'ID tarea', filterButton: true },
    ],
    rows: tableRows,
  });

  setTableHeaderStyle(worksheet, 4);

  worksheet.getColumn(1).width = 15;
  worksheet.getColumn(2).width = 42;
  worksheet.getColumn(3).width = 14;
  worksheet.getColumn(4).width = 19;
  worksheet.getColumn(5).width = 16;
  worksheet.getColumn(6).width = 14;
  worksheet.getColumn(7).width = 15;
  worksheet.getColumn(8).width = 22;
  worksheet.getColumn(9).width = 17;
  worksheet.getColumn(10).width = 36;
  worksheet.getColumn(10).hidden = true;

  if (tasks.length > 0) {
    const firstDataRow = 5;
    const lastDataRow = firstDataRow + tasks.length - 1;
    worksheet.getColumn(1).numFmt = 'dd/mm/yyyy';
    worksheet.getColumn(7).numFmt = 'dd/mm/yyyy';
    worksheet.getCell(firstDataRow, 1).numFmt = 'dd/mm/yyyy';
    worksheet.getCell(firstDataRow, 7).numFmt = 'dd/mm/yyyy';

    for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
      worksheet.getCell(rowNumber, 1).numFmt = 'dd/mm/yyyy';
      worksheet.getCell(rowNumber, 7).numFmt = 'dd/mm/yyyy';
    }

    styleTaskRows(worksheet, tasks, firstDataRow);
  }

  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
}

function addTrackingWorksheet(
  workbook: ExcelJS.Workbook,
  tasks: ExportableTask[],
  generatedAt: string,
): void {
  const worksheet = workbook.addWorksheet('Seguimientos', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const trackingCount = tasks.reduce((total, task) => total + task.seguimiento.length, 0);
  setTitle(
    worksheet,
    'Seguimientos',
    `${trackingCount} registro${trackingCount === 1 ? '' : 's'} · Actualizado ${generatedAt}`,
    5,
  );

  const rows: ExcelJS.CellValue[][] = [];
  tasks.forEach((task) => {
    task.seguimiento.forEach((tracking) => {
      rows.push([
        task.titulo,
        parseDate(tracking.fechaHora),
        tracking.usuario,
        tracking.texto,
        task.id,
      ]);
    });
  });

  worksheet.addTable({
    name: 'SeguimientosTareasTable',
    ref: 'A4',
    headerRow: true,
    totalsRow: false,
    style: {
      theme: 'TableStyleMedium2',
      showFirstColumn: false,
      showLastColumn: false,
      showRowStripes: false,
      showColumnStripes: false,
    },
    columns: [
      { name: 'Tarea', filterButton: true },
      { name: 'Fecha / hora', filterButton: true },
      { name: 'Usuario', filterButton: true },
      { name: 'Seguimiento', filterButton: true },
      { name: 'ID tarea', filterButton: true },
    ],
    rows,
  });

  setTableHeaderStyle(worksheet, 4);

  worksheet.getColumn(1).width = 42;
  worksheet.getColumn(2).width = 21;
  worksheet.getColumn(3).width = 18;
  worksheet.getColumn(4).width = 75;
  worksheet.getColumn(5).width = 36;
  worksheet.getColumn(5).hidden = true;

  if (rows.length > 0) {
    const firstDataRow = 5;
    const lastDataRow = firstDataRow + rows.length - 1;

    applyTrackingGroupShading(worksheet, rows, firstDataRow);

    for (let rowNumber = firstDataRow; rowNumber <= lastDataRow; rowNumber += 1) {
      worksheet.getCell(rowNumber, 2).numFmt = 'dd/mm/yyyy hh:mm';
      worksheet.getRow(rowNumber).alignment = { vertical: 'top', wrapText: true };
    }
  }

  worksheet.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.3,
      right: 0.3,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };
}

function taskFileDate(date = new Date()): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}-${month}-${date.getFullYear()}`;
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
      message: 'No hay carpeta configurada para el Excel de tareas abiertas.',
    };
  }

  const tasks = sortTasks(
    records
      .map((record) => parseTask(record.value))
      .filter((task): task is ExportableTask => task !== null),
  );

  const datedFileName = `Tareas_abiertas_${taskFileDate()}.xlsx`;
  const finalPath = path.join(directoryPath, datedFileName);
  const tempPath = path.join(
    directoryPath,
    `.Tareas_abiertas.${process.pid}.${Date.now()}.tmp.xlsx`,
  );
  const legacyWordPath = path.join(directoryPath, 'Tareas abiertas.doc');
  const legacyExcelPath = path.join(directoryPath, 'Tareas abiertas.xlsx');

  try {
    await mkdir(directoryPath, { recursive: true });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'TrAccion';
    workbook.company = 'TrAccion';
    workbook.subject = 'Tareas abiertas y seguimientos';
    workbook.title = 'Tareas abiertas';
    workbook.created = new Date();
    workbook.modified = new Date();

    const generatedAt = new Date().toLocaleString('es-ES');
    addTasksWorksheet(workbook, tasks, generatedAt);
    addTrackingWorksheet(workbook, tasks, generatedAt);

    await workbook.xlsx.writeFile(tempPath);
    await copyFile(tempPath, finalPath);
    await unlink(tempPath).catch(() => undefined);

    // Solo se conserva un Excel espejo de tareas. Si cambia el día, el fichero
    // adopta la nueva fecha y se elimina cualquier espejo anterior.
    const existingFiles = await readdir(directoryPath);
    const obsoleteExcelFiles = existingFiles.filter((name) =>
      name !== datedFileName &&
      name.startsWith('Tareas_abiertas_') &&
      name.toLowerCase().endsWith('.xlsx'),
    );
    for (const obsoleteFile of obsoleteExcelFiles) {
      await unlink(path.join(directoryPath, obsoleteFile)).catch(() => undefined);
    }

    // Se retiran también los nombres usados por desarrollos anteriores para evitar
    // que existan dos fuentes aparentemente válidas.
    await unlink(legacyExcelPath).catch(() => undefined);
    await unlink(legacyWordPath).catch(() => undefined);

    const trackingCount = tasks.reduce((total, task) => total + task.seguimiento.length, 0);

    return {
      ok: true,
      path: finalPath,
      count: tasks.length,
      message:
        `Excel actualizado correctamente: ${tasks.length} tareas abiertas y ` +
        `${trackingCount} registros de seguimiento.`,
    };
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    return {
      ok: false,
      path: finalPath,
      count: tasks.length,
      message:
        `La tarea se ha guardado, pero no se ha podido actualizar el Excel compartido: ${
          error instanceof Error ? error.message : String(error)
        }`,
    };
  }
}
