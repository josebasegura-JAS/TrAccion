import type { Employee } from '../../plantilla/domain/employee';
import { unzipDocx, zipDocx, type ZipEntry } from '../../teletrabajo/domain/zip';
import { validateConfiguredExcedenciaTemplatePath } from '../../configuracion/domain/teletrabajoTemplate';
import type { LicenciaSinSueldoRecord } from './licenciaSinSueldo';

const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface ProrrogaExcedenciaWordResult {
  fileName: string;
  blob: Blob;
  replacedFields: string[];
}

const BASQUE_MONTHS = [
  'urtarrilaren',
  'otsailaren',
  'martxoaren',
  'apirilaren',
  'maiatzaren',
  'ekainaren',
  'uztailaren',
  'abuztuaren',
  'irailaren',
  'urriaren',
  'azaroaren',
  'abenduaren',
] as const;

const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const REQUIRED_MARKERS = [
  '{{NOMBRE_COMPLETO}}',
  '{{DIRECCION}}',
  '{{CODIGO_POSTAL}}',
  '{{POBLACION}}',
  '{{PROVINCIA}}',
  '{{FECHA_CARTA_EU}}',
  '{{FECHA_CARTA_ES}}',
  '{{NOMBRE}}',
  '{{FECHA_PRORROGA_INICIO_EU}}',
  '{{FECHA_PRORROGA_FIN_EU}}',
  '{{FECHA_PRORROGA_INICIO_ES}}',
  '{{FECHA_PRORROGA_FIN_ES}}',
] as const;

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function formatSpanishLongDate(value: string): string {
  const parts = parseIsoDate(value);
  if (!parts) return value;
  return `${parts.day} de ${SPANISH_MONTHS[parts.month - 1]} de ${parts.year}`;
}

function formatBasqueApprovalDate(value: string): string {
  const parts = parseIsoDate(value);
  if (!parts) return value;
  return `${parts.year}ko ${BASQUE_MONTHS[parts.month - 1]} ${parts.day}an`;
}

function formatBasquePeriodDate(value: string, ending: 'tik' | 'ra arte'): string {
  const parts = parseIsoDate(value);
  if (!parts) return value;
  return `${parts.year}ko ${BASQUE_MONTHS[parts.month - 1]} ${parts.day}${ending}`;
}

function buildAddress(employee: Employee): string {
  return [employee.calle, employee.numero, employee.piso]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function extractShortName(fullName: string): string {
  const normalized = fullName.trim();
  if (!normalized) return '';
  const commaIndex = normalized.indexOf(',');
  if (commaIndex >= 0) {
    const afterComma = normalized.slice(commaIndex + 1).trim();
    return afterComma.split(/\s+/)[0] || afterComma || normalized;
  }
  return normalized.split(/\s+/)[0] || normalized;
}

function validateEmployee(employee: Employee | null): asserts employee is Employee {
  if (!employee) {
    throw new Error('No se puede generar el Word: la persona no existe en Plantilla.');
  }

  const missing: string[] = [];
  if (!employee.nombreApellidos.trim()) missing.push('Nombre y apellidos');
  if (!employee.calle.trim()) missing.push('Calle');
  if (!employee.numero.trim()) missing.push('Número');
  if (!employee.codigoPostal.trim()) missing.push('Código postal');
  if (!employee.poblacion.trim()) missing.push('Población');
  if (!employee.provincia.trim()) missing.push('Provincia');

  if (missing.length > 0) {
    throw new Error(
      `No se puede generar el Word de excedencia. Faltan datos en Plantilla: ${missing.join(', ')}.`,
    );
  }
}

function sanitizeFileName(value: string, fallback: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

async function readTemplateFromConfiguredPath(path: string): Promise<ArrayBuffer> {
  const templatePath = validateConfiguredExcedenciaTemplatePath(path);
  const api = window.traccion;

  if (!api || (!api.readExcedenciaTemplate && !api.readLicenciaSinSueldoTemplate && !api.readTeletrabajoTemplate)) {
    throw new Error('La plantilla de prórroga de Excedencia configurada no se encuentra disponible.');
  }

  try {
    if (api.readExcedenciaTemplate) return await api.readExcedenciaTemplate(templatePath);
    return api.readLicenciaSinSueldoTemplate
      ? await api.readLicenciaSinSueldoTemplate(templatePath)
      : await api.readTeletrabajoTemplate(templatePath);
  } catch {
    throw new Error('La plantilla de prórroga de Excedencia configurada no se encuentra disponible.');
  }
}

function replaceTextAcrossWordNodes(
  xml: string,
  replacements: ReadonlyMap<string, string>,
  replaced: Set<string>,
): string {
  const textNodeRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  const nodes: Array<{ start: number; end: number; text: string }> = [];
  let match = textNodeRegex.exec(xml);

  while (match) {
    const contentStart = match.index + match[0].indexOf(match[1]);
    nodes.push({ start: contentStart, end: contentStart + match[1].length, text: match[1] });
    match = textNodeRegex.exec(xml);
  }

  if (nodes.length === 0) return xml;

  const fullText = nodes.map((node) => unescapeXml(node.text)).join('');
  const charMap: Array<{ nodeIndex: number; offset: number }> = [];
  nodes.forEach((node, nodeIndex) => {
    const plainText = unescapeXml(node.text);
    for (let offset = 0; offset < plainText.length; offset += 1) {
      charMap.push({ nodeIndex, offset });
    }
    node.text = plainText;
  });

  const occurrences: Array<{ marker: string; replacement: string; index: number; end: number }> = [];
  replacements.forEach((replacement, marker) => {
    let index = fullText.indexOf(marker);
    while (index >= 0) {
      occurrences.push({ marker, replacement, index, end: index + marker.length });
      index = fullText.indexOf(marker, index + marker.length);
    }
  });

  occurrences
    .sort((left, right) => right.index - left.index || right.marker.length - left.marker.length)
    .forEach((occurrence) => {
      const start = charMap[occurrence.index];
      const end = charMap[occurrence.end - 1];
      if (!start || !end) return;
      replaced.add(occurrence.marker);

      if (start.nodeIndex === end.nodeIndex) {
        const node = nodes[start.nodeIndex];
        node.text = `${node.text.slice(0, start.offset)}${occurrence.replacement}${node.text.slice(end.offset + 1)}`;
        return;
      }

      const firstNode = nodes[start.nodeIndex];
      const lastNode = nodes[end.nodeIndex];
      firstNode.text = `${firstNode.text.slice(0, start.offset)}${occurrence.replacement}`;
      for (let index = start.nodeIndex + 1; index < end.nodeIndex; index += 1) {
        nodes[index].text = '';
      }
      lastNode.text = lastNode.text.slice(end.offset + 1);
    });

  let updated = '';
  let cursor = 0;
  nodes.forEach((node) => {
    updated += xml.slice(cursor, node.start) + escapeXml(node.text);
    cursor = node.end;
  });
  updated += xml.slice(cursor);
  return updated;
}

export async function generateProrrogaExcedenciaWord(
  record: LicenciaSinSueldoRecord,
  plantillaEmployee: Employee | null,
  templatePath: string,
  now = new Date(),
): Promise<ProrrogaExcedenciaWordResult> {
  if (record.tipo !== 'Excedencia') {
    throw new Error('El documento de prórroga solo está disponible para solicitudes de Excedencia.');
  }

  validateEmployee(plantillaEmployee);
  if (!record.prorroga || !parseIsoDate(record.prorroga.fechaInicio) || !parseIsoDate(record.prorroga.fechaFin)) {
    throw new Error('No se puede generar el Word de prórroga: faltan las fechas de la prórroga o no son válidas.');
  }

  const currentIso = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const fullName = plantillaEmployee.nombreApellidos.trim();

  const replacements = new Map<string, string>([
    ['{{NOMBRE_COMPLETO}}', fullName],
    ['{{DIRECCION}}', buildAddress(plantillaEmployee)],
    ['{{CODIGO_POSTAL}}', plantillaEmployee.codigoPostal.trim()],
    ['{{POBLACION}}', plantillaEmployee.poblacion.trim()],
    ['{{PROVINCIA}}', plantillaEmployee.provincia.trim()],
    ['{{FECHA_CARTA_EU}}', formatBasqueApprovalDate(currentIso)],
    ['{{FECHA_CARTA_ES}}', formatSpanishLongDate(currentIso)],
    ['{{NOMBRE}}', extractShortName(fullName)],
    ['{{FECHA_PRORROGA_INICIO_EU}}', formatBasquePeriodDate(record.prorroga.fechaInicio, 'tik')],
    ['{{FECHA_PRORROGA_FIN_EU}}', formatBasquePeriodDate(record.prorroga.fechaFin, 'ra arte')],
    ['{{FECHA_PRORROGA_INICIO_ES}}', formatSpanishLongDate(record.prorroga.fechaInicio)],
    ['{{FECHA_PRORROGA_FIN_ES}}', formatSpanishLongDate(record.prorroga.fechaFin)],
  ]);

  const templateBuffer = await readTemplateFromConfiguredPath(templatePath);
  const entries = await unzipDocx(templateBuffer);
  const replaced = new Set<string>();
  const outputEntries: ZipEntry[] = entries.map((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return entry;
    const xml = textDecoder.decode(entry.data);
    const updated = replaceTextAcrossWordNodes(xml, replacements, replaced);
    return updated === xml ? entry : { ...entry, data: textEncoder.encode(updated) };
  });

  const missingTemplateMarkers = REQUIRED_MARKERS.filter((marker) => !replaced.has(marker));
  if (missingTemplateMarkers.length > 0) {
    throw new Error(
      `La plantilla de prórroga de Excedencia no contiene todos los marcadores obligatorios: ${missingTemplateMarkers.join(', ')}.`,
    );
  }

  const name = sanitizeFileName(fullName, record.numeroEmpleado || 'SinNombre');
  const start = record.prorroga.fechaInicio.replace(/-/g, '');
  return {
    fileName: `Prorroga_excedencia_${name}_${start}.docx`,
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    replacedFields: [...replaced],
  };
}
