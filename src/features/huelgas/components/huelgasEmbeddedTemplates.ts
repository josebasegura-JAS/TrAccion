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
  instalaciones: { fileNamePattern: 'Instalaciones - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateInstalaciones },
  oacs: { fileNamePattern: 'OAC - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplateOacs },
  pmc: { fileNamePattern: 'PMC-Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx', base64: huelgaTemplatePmc },
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

async function rewriteEmbeddedWorkbook(template: EmbeddedHuelgaTemplate, fecha: string): Promise<ArrayBuffer> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(new Uint8Array(embeddedTemplateToArrayBuffer(template)));
  const formatted = formatDateParts(fecha);
  const textFiles = (Object.values(zip.files) as Array<{
    dir: boolean;
    name: string;
    async: (type: 'string') => Promise<string>;
  }>).filter((entry) => !entry.dir && entry.name.endsWith('.xml'));

  await Promise.all(textFiles.map(async (entry) => {
    const original = await entry.async('string');
    const updated = original
      .split('17-03-2026').join(formatted.file)
      .split('17_03_2026').join(formatted.file.split('-').join('_'))
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
    const detail = error instanceof Error ? ` ${error.message}` : '';
    throw new Error(`La plantilla Excel real no se ha podido preparar.${detail}`);
  }
}
