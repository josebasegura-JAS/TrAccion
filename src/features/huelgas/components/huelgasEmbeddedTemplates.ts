import huelgaTemplateMmAriz from './huelgaTemplateMmAriz';
import huelgaTemplateMmSopela from './huelgaTemplateMmSopela';
import huelgaTemplateGmoLinea from './huelgaTemplateGmoLinea';
import huelgaTemplateInstalaciones from './huelgaTemplateInstalaciones';
import huelgaTemplateOacs from './huelgaTemplateOacs';
import huelgaTemplatePmc from './huelgaTemplatePmc';
import huelgaTemplateJefaturaOperaciones from './huelgaTemplateJefaturaOperaciones';

export type EmbeddedHuelgaTemplate = { base64: string; fileNamePattern: string };
export const EMBEDDED_HUELGA_TEMPLATES: Record<string, EmbeddedHuelgaTemplate> = {
  'mm ariz': { fileNamePattern: 'MM Ariz - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateMmAriz },
  'mm sopela': { fileNamePattern: 'MM Sopela - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateMmSopela },
  'gmo y linea': { fileNamePattern: 'Línea y GMO - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateGmoLinea },
  'instalaciones': { fileNamePattern: 'Instalaciones - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateInstalaciones },
  'oacs': { fileNamePattern: 'OAC - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateOacs },
  'pmc': { fileNamePattern: 'PMC-Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplatePmc },
  'jefatura de operaciones': { fileNamePattern: 'Jefatura de operaciones y otros - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateJefaturaOperaciones },
};

export function embeddedTemplateToArrayBuffer(template: EmbeddedHuelgaTemplate): ArrayBuffer {
  const binary = atob(template.base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function formatDateParts(fecha: string): { file: string; long: string; compactLong: string } {
  const [year, month, day] = fecha.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(date);
  return {
    file: `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`,
    long: `${day} de ${monthName} de ${year}`,
    compactLong: `${day} ${monthName} ${year}`,
  };
}

function circuitNameFromPattern(pattern: string): string {
  const withoutDate = pattern
    .replace('{{FECHA_HUELGA_ARCHIVO}}', '')
    .replace(/\.xlsx$/i, '')
    .replace(/[-–]\s*Seguimiento huelga\s*$/i, '')
    .replace(/Seguimiento huelga\s*$/i, '')
    .trim();
  return withoutDate || 'Circuito';
}

function workbookBufferToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }
  throw new Error('No se ha podido generar un Excel de respaldo válido.');
}

async function buildFallbackWorkbook(template: EmbeddedHuelgaTemplate, fecha: string): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const formatted = formatDateParts(fecha);
  const circuitName = circuitNameFromPattern(template.fileNamePattern);
  workbook.creator = 'TrAcción';
  workbook.created = new Date();

  const summary = workbook.addWorksheet('Seguimiento', {
    views: [{ state: 'frozen', ySplit: 11 }],
  });
  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = `SEGUIMIENTO DE HUELGA · ${circuitName}`;
  summary.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD71920' } };
  summary.getRow(1).height = 28;

  summary.getCell('A3').value = 'Circuito';
  summary.getCell('B3').value = circuitName;
  summary.getCell('A4').value = 'Fecha';
  summary.getCell('B4').value = formatted.long;

  const metrics = [
    ['Personas con turno', ''],
    ['Servicios mínimos', ''],
    ['Personas que trabajan', ''],
    ['Personas en huelga', ''],
  ];
  metrics.forEach(([label, value], index) => {
    const row = 6 + index;
    summary.getCell(`A${row}`).value = label;
    summary.getCell(`A${row}`).font = { bold: true };
    summary.getCell(`B${row}`).value = value;
    summary.getCell(`B${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
    summary.getCell(`B${row}`).border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  summary.mergeCells('A11:D11');
  summary.getCell('A11').value = 'Completa los totales y, en la hoja “Personal en huelga”, la relación nominal de quienes secundan la huelga.';
  summary.getCell('A11').font = { italic: true, color: { argb: 'FF475569' } };
  summary.getCell('A11').alignment = { wrapText: true };
  summary.columns = [{ width: 28 }, { width: 22 }, { width: 18 }, { width: 18 }];

  const strikeSheet = workbook.addWorksheet('Personal en huelga');
  strikeSheet.addRow(['Nº empleado', 'Nombre y apellidos', 'Observaciones']);
  strikeSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  strikeSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
  strikeSheet.views = [{ state: 'frozen', ySplit: 1 }];
  strikeSheet.columns = [{ width: 16 }, { width: 42 }, { width: 42 }];
  for (let row = 2; row <= 151; row += 1) {
    if (row % 2 === 0) {
      strikeSheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    }
  }

  const generated = await workbook.xlsx.writeBuffer();
  return workbookBufferToArrayBuffer(generated);
}

async function rewriteEmbeddedWorkbook(template: EmbeddedHuelgaTemplate, fecha: string): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(embeddedTemplateToArrayBuffer(template));
  const formatted = formatDateParts(fecha);
  const textFiles = (Object.values(zip.files) as Array<{ dir: boolean; name: string; async: (type: 'string') => Promise<string> }>).filter((entry) => !entry.dir && entry.name.endsWith('.xml'));

  await Promise.all(textFiles.map(async (entry) => {
    const original = await entry.async('string');
    const updated = original
      .split('17-03-2026').join(formatted.file)
      .split('17 de marzo de 2026').join(formatted.long)
      .split('17 marzo 2026').join(formatted.compactLong)
      .split('22 de abril de 2021').join(formatted.long)
      .split('16-04-2021').join(formatted.file);
    if (updated !== original) zip.file(entry.name, updated);
  }));

  const generated = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return generated.buffer.slice(generated.byteOffset, generated.byteOffset + generated.byteLength) as ArrayBuffer;
}

export async function embeddedTemplateForDate(template: EmbeddedHuelgaTemplate, fecha: string): Promise<ArrayBuffer> {
  try {
    return await rewriteEmbeddedWorkbook(template, fecha);
  } catch (error) {
    console.warn(
      '[huelgas] Plantilla Excel embebida dañada; se genera una copia de respaldo válida.',
      error,
    );
    return buildFallbackWorkbook(template, fecha);
  }
}
