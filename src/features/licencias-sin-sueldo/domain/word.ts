import { toLocalIsoDate as todayIso } from '../../../utils/dateOnly';
import type { Employee } from '../../plantilla/domain/employee';
import {
  normalizeJobPosition,
  type JobPositionTranslation,
} from '../../plantilla/domain/jobPositionTranslation';
import {
  LICENCIA_SIN_SUELDO_TEMPLATE_UNAVAILABLE_MESSAGE,
  validateConfiguredLicenciaSinSueldoTemplatePath,
} from '../../configuracion/domain/teletrabajoTemplate';
import type { LicenciaSinSueldoRecord } from './licenciaSinSueldo';
import { unzipDocx, zipDocx, type ZipEntry } from '../../teletrabajo/domain/zip';

const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface LicenciaSinSueldoWordMarkerMapping {
  marker: string;
  source: string;
}

export interface LicenciaSinSueldoWordResult {
  fileName: string;
  blob: Blob;
  detectedMarkers: LicenciaSinSueldoWordMarkerMapping[];
  emptyMarkers: LicenciaSinSueldoWordMarkerMapping[];
}

const REQUIRED_FIELDS = [
  ['nombreCompleto', 'Nombre completo'],
  ['puestoCast', 'Puesto CAST'],
  ['puestoEus', 'Puesto EUS'],
  ['fechaInicio', 'Fecha inicio'],
  ['fechaFin', 'Fecha fin'],
] as const;

const LICENCIA_SIN_SUELDO_MARKER_MAP = [
  ['«Nombre_Completo»', 'nombreCompleto'],
  ['«Nombre_Corto»', 'nombreCorto'],
  ['«Puesto_CAST»', 'puestoCast'],
  ['«Puesto_CAS»', 'puestoCast'],
  ['«Puesto_EUS»', 'puestoEus'],
  ['«Fecha_Solicitud»', 'fechaSolicitud'],
  ['«Fecha_Inicio»', 'fechaInicio'],
  ['«Fecha_Fin»', 'fechaFin'],
  ['«D/M/A»', 'currentDate'],
  ['D/M/A', 'currentDate'],
] as const;

export const LICENCIA_SIN_SUELDO_WORD_MARKER_SOURCES: readonly LicenciaSinSueldoWordMarkerMapping[] =
  LICENCIA_SIN_SUELDO_MARKER_MAP.map(([marker, source]) => ({ marker, source }));

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

function parseDateOnly(value: string): { year: number; month: number; day: number } | null {
  const text = value.trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year > 70 ? 1900 : 2000;
    return { year, month: Number(match[2]), day: Number(match[1]) };
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }

  return null;
}

function formatDateNumeric(value: string): string {
  const parts = parseDateOnly(value);
  if (!parts) return value.trim();
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function docxReplacementXml(value: string): string {
  return String(value ?? '')
    .split(/\r\n|\r|\n/)
    .map(escapeXml)
    .join('</w:t><w:br/><w:t>');
}

function findTranslatedPosition(
  puestoCastellano: string,
  translations: readonly JobPositionTranslation[],
): string {
  const normalized = normalizeJobPosition(puestoCastellano);
  if (!normalized) return '';

  return (
    translations.find(
      (translation) => normalizeJobPosition(translation.puestoCastellano) === normalized,
    )?.puestoEuskera ?? ''
  );
}

function resolvePuestoEus(
  plantillaEmployee: Employee | null,
  puestoCast: string,
  translations: readonly JobPositionTranslation[],
): string {
  const puestoEusPlantilla = plantillaEmployee?.puestoEus.trim() ?? '';
  if (puestoEusPlantilla) return puestoEusPlantilla;

  const translated = findTranslatedPosition(puestoCast, translations).trim();
  if (translated) return translated;

  return puestoCast;
}

function extractNombreCorto(nombreCompleto: string): string {
  const commaIndex = nombreCompleto.indexOf(',');
  if (commaIndex < 0) return nombreCompleto.trim();
  return nombreCompleto.slice(commaIndex + 1).trim() || nombreCompleto.trim();
}

function buildWordData(
  record: LicenciaSinSueldoRecord,
  plantillaEmployee: Employee | null,
  jobPositionTranslations: readonly JobPositionTranslation[] = [],
  now = new Date(),
): Record<string, string> {
  const nombreCompleto = record.nombreCompleto || plantillaEmployee?.nombreApellidos || '';
  const puestoCast = plantillaEmployee?.puestoNomina || plantillaEmployee?.puestoOrganizativo || '';
  const puestoEus = resolvePuestoEus(plantillaEmployee, puestoCast, jobPositionTranslations);

  return {
    nombreCompleto,
    nombreCorto: extractNombreCorto(nombreCompleto),
    puestoCast,
    puestoEus,
    fechaSolicitud: formatDateNumeric(record.fechaSolicitud),
    fechaInicio: formatDateNumeric(record.fechaInicio),
    fechaFin: formatDateNumeric(record.fechaFin),
    currentDate: formatDateNumeric(todayIso(now)),
  };
}

function validateWordData(data: Record<string, string>): string[] {
  return REQUIRED_FIELDS.filter(([key]) => !String(data[key] ?? '').trim()).map(([, label]) => label);
}

function findAllOccurrences(text: string, marker: string): number[] {
  const positions: number[] = [];
  let index = text.indexOf(marker);
  while (index >= 0) {
    positions.push(index);
    index = text.indexOf(marker, index + marker.length);
  }
  return positions;
}

function replaceMarkersInTextNodes(
  xml: string,
  replacements: ReadonlyMap<string, string>,
  foundMarkers: Set<string>,
): string {
  const textNodeRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
  const nodes: Array<{ start: number; end: number; text: string }> = [];
  let match = textNodeRegex.exec(xml);

  while (match) {
    const contentStart = match.index + match[0].indexOf(match[1]);
    nodes.push({ start: contentStart, end: contentStart + match[1].length, text: match[1] });
    match = textNodeRegex.exec(xml);
  }

  if (!nodes.length) return xml;

  const fullText = nodes.map((node) => unescapeXml(node.text)).join('');
  const charMap: Array<{ nodeIndex: number; offset: number }> = [];
  nodes.forEach((node, nodeIndex) => {
    const plainText = unescapeXml(node.text);
    for (let offset = 0; offset < plainText.length; offset += 1) {
      charMap.push({ nodeIndex, offset });
    }
    node.text = plainText;
  });

  const occurrences: Array<{ marker: string; replacement: string; index: number; end: number }> =
    [];
  replacements.forEach((replacement, marker) => {
    findAllOccurrences(fullText, marker).forEach((index) =>
      occurrences.push({ marker, replacement, index, end: index + marker.length }),
    );
  });

  if (!occurrences.length) return xml;

  const selectedOccurrences: typeof occurrences = [];
  const occupied = new Array(fullText.length).fill(false);
  occurrences
    .sort(
      (left, right) =>
        left.index - right.index || right.end - right.index - (left.end - left.index),
    )
    .forEach((occurrence) => {
      for (let pos = occurrence.index; pos < occurrence.end; pos += 1) {
        if (occupied[pos]) return;
      }
      for (let pos = occurrence.index; pos < occurrence.end; pos += 1) occupied[pos] = true;
      selectedOccurrences.push(occurrence);
    });

  selectedOccurrences
    .sort((left, right) => right.index - left.index)
    .forEach((occurrence) => {
      const start = charMap[occurrence.index];
      const end = charMap[occurrence.end - 1];
      if (!start || !end) return;
      foundMarkers.add(occurrence.marker);

      if (start.nodeIndex === end.nodeIndex) {
        const node = nodes[start.nodeIndex];
        node.text = `${node.text.slice(0, start.offset)}${occurrence.replacement}${node.text.slice(
          end.offset + 1,
        )}`;
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
    updated += xml.slice(cursor, node.start) + node.text;
    cursor = node.end;
  });
  updated += xml.slice(cursor);
  return updated;
}

function sourceDescription(marker: string): string {
  return (
    LICENCIA_SIN_SUELDO_WORD_MARKER_SOURCES.find((mapping) => mapping.marker === marker)?.source ??
    ''
  );
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

function buildFileName(record: LicenciaSinSueldoRecord): string {
  const nombre = sanitizeFileName(record.nombreCompleto, record.numeroEmpleado || 'SinNombre');
  const inicio = record.fechaInicio.replace(/-/g, '');
  return `Licencia_sin_sueldo_${nombre}_${inicio || 'sin_fecha'}.docx`;
}

async function readTemplateFromConfiguredPath(path: string): Promise<ArrayBuffer> {
  const templatePath = validateConfiguredLicenciaSinSueldoTemplatePath(path);
  const api = window.traccion;

  if (!api || (!api.readLicenciaSinSueldoTemplate && !api.readTeletrabajoTemplate)) {
    throw new Error(LICENCIA_SIN_SUELDO_TEMPLATE_UNAVAILABLE_MESSAGE);
  }

  try {
    return api.readLicenciaSinSueldoTemplate
      ? await api.readLicenciaSinSueldoTemplate(templatePath)
      : await api.readTeletrabajoTemplate(templatePath);
  } catch {
    throw new Error(LICENCIA_SIN_SUELDO_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
}

export async function generateLicenciaSinSueldoWord(
  record: LicenciaSinSueldoRecord,
  plantillaEmployee: Employee | null,
  templatePath: string,
  jobPositionTranslations: readonly JobPositionTranslation[] = [],
): Promise<LicenciaSinSueldoWordResult> {
  if (record.tipo !== 'Licencia sin sueldo') {
    throw new Error('El Word solo está disponible para registros de Licencia sin sueldo.');
  }

  if (record.estado !== 'pendiente_firma') {
    throw new Error('El Word solo puede generarse cuando la licencia está pendiente de firma.');
  }

  const templateBuffer = await readTemplateFromConfiguredPath(templatePath);
  const entries = await unzipDocx(templateBuffer);
  const data = buildWordData(record, plantillaEmployee, jobPositionTranslations);
  const missing = validateWordData(data);

  if (missing.length) {
    throw new Error(`No se puede generar el Word. Faltan datos obligatorios: ${missing.join(', ')}.`);
  }

  const replacements = new Map(
    LICENCIA_SIN_SUELDO_MARKER_MAP.map(([marker, key]) => [marker, docxReplacementXml(data[key])]),
  );
  const foundMarkers = new Set<string>();
  const outputEntries: ZipEntry[] = entries.map((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return entry;
    const xml = textDecoder.decode(entry.data);
    const updated = replaceMarkersInTextNodes(xml, replacements, foundMarkers);
    return updated === xml ? entry : { ...entry, data: textEncoder.encode(updated) };
  });
  const detectedMarkers = [...foundMarkers].map((marker) => ({
    marker,
    source: sourceDescription(marker),
  }));
  const emptyMarkers = detectedMarkers.filter((mapping) => !data[mapping.source]);

  return {
    fileName: buildFileName(record),
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    detectedMarkers,
    emptyMarkers,
  };
}
