import type { Employee } from '../../plantilla/domain/employee';
import {
  VINCULOGRAMA_TEMPLATE_UNAVAILABLE_MESSAGE,
  validateConfiguredVinculogramaTemplatePath,
} from '../../configuracion/domain/teletrabajoTemplate';
import { unzipDocx, zipDocx, type ZipEntry } from '../../teletrabajo/domain/zip';

const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const VINCULOGRAMA_MARKER_MAP = [
  ['«Nombre_Completo»', 'nombreCompleto'],
  ['«DNI»', 'dni'],
  ['«D/M/A»', 'currentDateNumeric'],
  ['D/M/A', 'currentDateNumeric'],
] as const;

export interface VinculogramaWordResult {
  fileName: string;
  blob: Blob;
  detectedMarkers: string[];
}

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

function todayNumeric(now = new Date()): string {
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

function sanitizeFilePart(value: string, fallback: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback
  );
}

function docxReplacementXml(value: string): string {
  return String(value ?? '')
    .split(/\r\n|\r|\n/)
    .map(escapeXml)
    .join('</w:t><w:br/><w:t>');
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

  const occurrences: Array<{ marker: string; replacement: string; index: number; end: number }> = [];
  replacements.forEach((replacement, marker) => {
    findAllOccurrences(fullText, marker).forEach((index) =>
      occurrences.push({ marker, replacement, index, end: index + marker.length }),
    );
  });

  if (!occurrences.length) return xml;

  const selectedOccurrences: typeof occurrences = [];
  const occupied = new Array(fullText.length).fill(false);
  occurrences
    .sort((left, right) => left.index - right.index || right.marker.length - left.marker.length)
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
      for (let index = start.nodeIndex + 1; index < end.nodeIndex; index += 1) nodes[index].text = '';
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

async function readTemplateFromConfiguredPath(path: string): Promise<ArrayBuffer> {
  const templatePath = validateConfiguredVinculogramaTemplatePath(path);

  const reader = window.traccion?.readVinculogramaTemplate ?? window.traccion?.readTeletrabajoTemplate;
  if (!reader) {
    throw new Error(VINCULOGRAMA_TEMPLATE_UNAVAILABLE_MESSAGE);
  }

  try {
    return await reader(templatePath);
  } catch {
    throw new Error(VINCULOGRAMA_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
}

function buildFileName(employee: Employee): string {
  return `Solicitud_Vinculograma_${sanitizeFilePart(employee.nombreApellidos, employee.empleado || 'Empleado')}.docx`;
}

export async function generateVinculogramaSolicitudWord(
  employee: Employee,
  templatePath: string,
): Promise<VinculogramaWordResult> {
  const templateBuffer = await readTemplateFromConfiguredPath(templatePath);
  const entries = await unzipDocx(templateBuffer);
  const data: Record<string, string> = {
    nombreCompleto: employee.nombreApellidos.trim(),
    dni: (employee.dni || employee.nif).trim(),
    currentDateNumeric: todayNumeric(),
  };

  if (!data.nombreCompleto || !data.dni) {
    throw new Error('No se puede generar la solicitud. Faltan nombre completo o DNI en Plantilla.');
  }

  const replacements = new Map(
    VINCULOGRAMA_MARKER_MAP.map(([marker, key]) => [marker, docxReplacementXml(data[key])]),
  );
  const foundMarkers = new Set<string>();
  const outputEntries: ZipEntry[] = entries.map((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return entry;
    const xml = textDecoder.decode(entry.data);
    const updated = replaceMarkersInTextNodes(xml, replacements, foundMarkers);
    return updated === xml ? entry : { ...entry, data: textEncoder.encode(updated) };
  });

  return {
    fileName: buildFileName(employee),
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    detectedMarkers: [...foundMarkers].sort((left, right) => left.localeCompare(right)),
  };
}
