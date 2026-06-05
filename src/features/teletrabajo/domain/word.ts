import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoDia, TeletrabajoDraft, TeletrabajoSolicitud } from './solicitud';
import { unzipDocx, zipDocx, type ZipEntry } from './zip';

const WORD_DOCUMENT_ENTRY = 'word/document.xml';
const TEMPLATE_URL = '/templates/rrll-dashboard-teletrabajo.docx';
const WORD_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type TeletrabajoWordSource = TeletrabajoDraft | TeletrabajoSolicitud;

export interface TeletrabajoWordMarkerMapping {
  marker: string;
  source: string;
}

export interface TeletrabajoWordResult {
  fileName: string;
  blob: Blob;
  detectedMarkers: TeletrabajoWordMarkerMapping[];
  emptyMarkers: TeletrabajoWordMarkerMapping[];
}

interface MarkerMatch {
  marker: string;
  token: string;
}

const DIRECT_FIELD_MARKERS = [
  'empleado',
  'nombreApellidos',
  'puestoNomina',
  'puestoOrganizativo',
  'residencia',
  'dni',
  'direccionTeletrabajo',
  'tipoSolicitud',
  'periodo',
  'observaciones',
] as const;

const DIA_MARKERS: readonly TeletrabajoDia[] = ['martes', 'miercoles', 'jueves'];

export const TELETRABAJO_WORD_TEMPLATE_URL = TEMPLATE_URL;

export const TELETRABAJO_WORD_MARKER_SOURCES: readonly TeletrabajoWordMarkerMapping[] = [
  ...DIRECT_FIELD_MARKERS.map((marker) => ({ marker, source: `Teletrabajo.${marker}` })),
  ...DIA_MARKERS.map((marker) => ({
    marker,
    source: `Teletrabajo.diasTeletrabajo incluye ${marker}`,
  })),
  { marker: 'residenciaCast', source: 'Plantilla.residenciaCast; fallback Teletrabajo.residencia' },
  { marker: 'residenciaEus', source: 'Plantilla.residenciaEus; fallback Teletrabajo.residencia' },
];

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeMarkerName(marker: string): string {
  return marker.trim();
}

function valueFromSource(
  source: TeletrabajoWordSource,
  plantillaEmployee: Employee | null,
  marker: string,
): string {
  if (marker === 'martes' || marker === 'miercoles' || marker === 'jueves') {
    return source.diasTeletrabajo.includes(marker) ? 'X' : '';
  }

  if (marker === 'residenciaCast') {
    return plantillaEmployee?.residenciaCast || source.residencia;
  }

  if (marker === 'residenciaEus') {
    return plantillaEmployee?.residenciaEus || source.residencia;
  }

  if (DIRECT_FIELD_MARKERS.includes(marker as (typeof DIRECT_FIELD_MARKERS)[number])) {
    return source[marker as (typeof DIRECT_FIELD_MARKERS)[number]];
  }

  return '';
}

function sourceDescription(marker: string): string {
  return TELETRABAJO_WORD_MARKER_SOURCES.find((mapping) => mapping.marker === marker)?.source ?? '';
}

function findDocumentEntry(entries: readonly ZipEntry[]): ZipEntry {
  const documentEntry = entries.find((entry) => entry.name === WORD_DOCUMENT_ENTRY);

  if (!documentEntry) {
    throw new Error('La plantilla DOCX no contiene word/document.xml.');
  }

  return documentEntry;
}

function extractBookmarkMarkers(documentXml: string): string[] {
  const markers = new Set<string>();
  const bookmarkPattern = /<w:bookmarkStart\b[^>]*\bw:name="([^"]+)"[^>]*>/g;
  let match = bookmarkPattern.exec(documentXml);

  while (match) {
    const marker = normalizeMarkerName(unescapeXml(match[1]));
    if (marker && !marker.startsWith('_')) {
      markers.add(marker);
    }
    match = bookmarkPattern.exec(documentXml);
  }

  return [...markers];
}

function extractTemplateTokenMarkers(documentXml: string): MarkerMatch[] {
  const markers = new Map<string, MarkerMatch>();
  const tokenPattern = /(?:\{\{|\$\{|«)([A-Za-z0-9_]+)(?:\}\}|\}|»)/g;
  let match = tokenPattern.exec(documentXml);

  while (match) {
    const marker = normalizeMarkerName(match[1]);
    if (marker && !markers.has(marker)) {
      markers.set(marker, { marker, token: match[0] });
    }
    match = tokenPattern.exec(documentXml);
  }

  return [...markers.values()];
}

export function detectTeletrabajoWordMarkers(templateBuffer: ArrayBuffer): Promise<string[]> {
  return unzipDocx(templateBuffer).then((entries) => {
    const documentXml = textDecoder.decode(findDocumentEntry(entries).data);
    const markers = new Set<string>(extractBookmarkMarkers(documentXml));

    for (const tokenMarker of extractTemplateTokenMarkers(documentXml)) {
      markers.add(tokenMarker.marker);
    }

    return [...markers].sort((left, right) => left.localeCompare(right));
  });
}

function replaceTokenMarkers(
  documentXml: string,
  markers: readonly MarkerMatch[],
  values: ReadonlyMap<string, string>,
): string {
  return markers.reduce((currentXml, marker) => {
    const value = values.get(marker.marker) ?? '';
    return currentXml.replace(new RegExp(escapeRegExp(marker.token), 'g'), escapeXml(value));
  }, documentXml);
}

function textRun(value: string): string {
  return `<w:r><w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
}

function replaceBookmarkMarker(documentXml: string, marker: string, value: string): string {
  const startPattern = new RegExp(
    `<w:bookmarkStart\\b(?=[^>]*\\bw:name="${escapeRegExp(escapeXml(marker))}")[^>]*\\bw:id="([^"]+)"[^>]*/>`,
  );
  const startMatch = documentXml.match(startPattern);

  if (!startMatch || startMatch.index === undefined) {
    return documentXml;
  }

  const bookmarkId = startMatch[1];
  const startEndIndex = startMatch.index + startMatch[0].length;
  const endPattern = new RegExp(
    `<w:bookmarkEnd\\b(?=[^>]*\\bw:id="${escapeRegExp(bookmarkId)}")[^>]*/>`,
  );
  const afterStart = documentXml.slice(startEndIndex);
  const endMatch = afterStart.match(endPattern);

  if (!endMatch || endMatch.index === undefined) {
    return `${documentXml.slice(0, startEndIndex)}${textRun(value)}${documentXml.slice(startEndIndex)}`;
  }

  const endIndex = startEndIndex + endMatch.index;
  return `${documentXml.slice(0, startEndIndex)}${textRun(value)}${documentXml.slice(endIndex)}`;
}

function replaceBookmarkMarkers(
  documentXml: string,
  markers: readonly string[],
  values: ReadonlyMap<string, string>,
): string {
  return markers.reduce((currentXml, marker) => {
    const value = values.get(marker) ?? '';
    return replaceBookmarkMarker(currentXml, marker, value);
  }, documentXml);
}

function buildMarkerValues(
  source: TeletrabajoWordSource,
  plantillaEmployee: Employee | null,
  markers: readonly string[],
): Map<string, string> {
  const values = new Map<string, string>();

  for (const marker of markers) {
    values.set(marker, valueFromSource(source, plantillaEmployee, marker));
  }

  return values;
}

function buildFileName(source: TeletrabajoWordSource): string {
  const empleado = source.empleado.trim() || 'sin-empleado';
  const periodo = source.periodo.trim() || 'sin-periodo';
  return `teletrabajo-${empleado}-${periodo}.docx`;
}

async function fetchTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(TEMPLATE_URL);

  if (!response.ok) {
    throw new Error(`No se ha encontrado la plantilla DOCX de RRLL Dashboard en ${TEMPLATE_URL}.`);
  }

  return response.arrayBuffer();
}

export async function generateTeletrabajoWord(
  source: TeletrabajoWordSource,
  plantillaEmployee: Employee | null,
): Promise<TeletrabajoWordResult> {
  const templateBuffer = await fetchTemplate();
  const entries = await unzipDocx(templateBuffer);
  const documentEntry = findDocumentEntry(entries);
  const documentXml = textDecoder.decode(documentEntry.data);
  const bookmarkMarkers = extractBookmarkMarkers(documentXml);
  const tokenMarkers = extractTemplateTokenMarkers(documentXml);
  const markers = [
    ...new Set([...bookmarkMarkers, ...tokenMarkers.map((marker) => marker.marker)]),
  ];
  const values = buildMarkerValues(source, plantillaEmployee, markers);
  const withBookmarkValues = replaceBookmarkMarkers(documentXml, bookmarkMarkers, values);
  const withAllValues = replaceTokenMarkers(withBookmarkValues, tokenMarkers, values);
  const outputEntries = entries.map((entry) =>
    entry.name === WORD_DOCUMENT_ENTRY
      ? { ...entry, data: textEncoder.encode(withAllValues) }
      : entry,
  );
  const detectedMarkers = markers.map((marker) => ({ marker, source: sourceDescription(marker) }));
  const emptyMarkers = detectedMarkers.filter((mapping) => !values.get(mapping.marker));

  return {
    fileName: buildFileName(source),
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    detectedMarkers,
    emptyMarkers,
  };
}
