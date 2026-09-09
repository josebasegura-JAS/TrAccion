import type { Employee } from '../../plantilla/domain/employee';
import { unzipDocx, zipDocx, type ZipEntry } from '../../teletrabajo/domain/zip';
import type { LicenciaSinSueldoRecord } from './licenciaSinSueldo';
import { EXCEDENCIA_WORD_TEMPLATE_BASE64 } from './excedenciaWordTemplate';

const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface ExcedenciaWordResult {
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

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
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

function formatBasquePeriodDate(value: string, suffix: 'tik' | 'ra'): string {
  const parts = parseIsoDate(value);
  if (!parts) return value;
  return `${parts.year}ko ${BASQUE_MONTHS[parts.month - 1]} ${parts.day}${suffix}`;
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

  const occupied = new Array(fullText.length).fill(false);
  const selected: typeof occurrences = [];
  occurrences
    .sort((left, right) => left.index - right.index || right.marker.length - left.marker.length)
    .forEach((occurrence) => {
      for (let position = occurrence.index; position < occurrence.end; position += 1) {
        if (occupied[position]) return;
      }
      for (let position = occurrence.index; position < occurrence.end; position += 1) {
        occupied[position] = true;
      }
      selected.push(occurrence);
    });

  selected
    .sort((left, right) => right.index - left.index)
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

export async function generateExcedenciaWord(
  record: LicenciaSinSueldoRecord,
  plantillaEmployee: Employee | null,
  now = new Date(),
): Promise<ExcedenciaWordResult> {
  if (record.tipo !== 'Excedencia') {
    throw new Error('El documento de excedencia solo está disponible para solicitudes de Excedencia.');
  }
  if (record.estado !== 'pendiente_firma') {
    throw new Error('El Word de excedencia solo puede generarse cuando la solicitud está aprobada.');
  }

  validateEmployee(plantillaEmployee);
  if (!parseIsoDate(record.fechaInicio) || !parseIsoDate(record.fechaFin)) {
    throw new Error('No se puede generar el Word de excedencia: las fechas de inicio o fin no son válidas.');
  }

  const currentIso = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
  const fullName = plantillaEmployee.nombreApellidos.trim();
  const shortName = extractShortName(fullName);
  const address = buildAddress(plantillaEmployee);

  const replacements = new Map<string, string>([
    ['“”Nombre y apellidos del solicitante”', fullName],
    ['“Nombre y apellidos del solicitante”', fullName],
    ['“CALLE”', address],
    ['“CODIGO POSTAL”', plantillaEmployee.codigoPostal.trim()],
    ['“POBLACION”', plantillaEmployee.poblacion.trim()],
    ['“Provincia”', plantillaEmployee.provincia.trim()],
    ['“Nombre”', shortName],
    ['Bilbon, 2026ko iraialaren 7an', `Bilbon, ${formatBasqueApprovalDate(currentIso)}`],
    ['Bilbao, 7 de septiembre de 2026', `Bilbao, ${formatSpanishLongDate(currentIso)}`],
    [
      '2026ko abenduaren 31tik 2029ko abenduaren 31ra arte',
      `${formatBasquePeriodDate(record.fechaInicio, 'tik')} ${formatBasquePeriodDate(record.fechaFin, 'ra')} arte`,
    ],
    [
      '31 de diciembre de 2026 y el 31 de diciembre de 2029',
      `${formatSpanishLongDate(record.fechaInicio)} y el ${formatSpanishLongDate(record.fechaFin)}`,
    ],
  ]);

  const entries = await unzipDocx(decodeBase64(EXCEDENCIA_WORD_TEMPLATE_BASE64));
  const replaced = new Set<string>();
  const outputEntries: ZipEntry[] = entries.map((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return entry;
    const xml = textDecoder.decode(entry.data);
    const updated = replaceTextAcrossWordNodes(xml, replacements, replaced);
    return updated === xml ? entry : { ...entry, data: textEncoder.encode(updated) };
  });

  const requiredMarkers = [
    '“CALLE”',
    '“CODIGO POSTAL”',
    '“POBLACION”',
    '“Provincia”',
    '“Nombre”',
    'Bilbao, 7 de septiembre de 2026',
    '31 de diciembre de 2026 y el 31 de diciembre de 2029',
  ];
  const missingTemplateMarkers = requiredMarkers.filter((marker) => !replaced.has(marker));
  const hasFullName =
    replaced.has('“”Nombre y apellidos del solicitante”') ||
    replaced.has('“Nombre y apellidos del solicitante”');
  if (!hasFullName) missingTemplateMarkers.unshift('Nombre y apellidos');

  if (missingTemplateMarkers.length > 0) {
    throw new Error(
      `La plantilla de excedencia no contiene todos los campos esperados: ${missingTemplateMarkers.join(', ')}.`,
    );
  }

  const name = sanitizeFileName(fullName, record.numeroEmpleado || 'SinNombre');
  const start = record.fechaInicio.replace(/-/g, '');
  return {
    fileName: `Concesion_excedencia_${name}_${start}.docx`,
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    replacedFields: [...replaced],
  };
}
