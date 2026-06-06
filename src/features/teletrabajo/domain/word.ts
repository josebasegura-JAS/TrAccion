import type { Employee } from '../../plantilla/domain/employee';
import {
  TELETRABAJO_TEMPLATE_UNAVAILABLE_MESSAGE,
  validateConfiguredTeletrabajoTemplatePath,
} from '../../configuracion/domain/teletrabajoTemplate';
import type { TeletrabajoDia, TeletrabajoDraft, TeletrabajoSolicitud } from './solicitud';
import { unzipDocx, zipDocx, type ZipEntry } from './zip';

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

const MONTHS_CAST = [
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
];

const MONTHS_EUS = [
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
];

const DAY_LABELS: Record<TeletrabajoDia, { cast: string; eus: string }> = {
  martes: { cast: 'martes', eus: 'asteartea' },
  miercoles: { cast: 'miércoles', eus: 'asteazkena' },
  jueves: { cast: 'jueves', eus: 'osteguna' },
};

const TELETRABAJO_REQUIRED_FIELDS = [
  ['dni', 'DNI'],
  ['direccionTeletrabajo', 'Dirección Teletrabajo'],
  ['residenciaCast', 'Residencia CAST'],
  ['residenciaEus', 'Residencia EUS'],
  ['puestoCast', 'Puesto CAST'],
  ['puestoEus', 'Puesto EUS'],
  ['fechaInicioTeletrabajoCast', 'Fecha inicio CAST'],
  ['fechaFinTeletrabajoCast', 'Fecha fin CAST'],
  ['fechaInicioTeletrabajoEus', 'Fecha inicio EUS'],
  ['fechaFinTeletrabajoEus', 'Fecha fin EUS'],
  ['diasTeletrabajoCast', 'Días de teletrabajo CAST'],
  ['diasTeletrabajoEus', 'Días de teletrabajo EUS'],
  ['porcentajeTeletrabajo', 'Porcentaje'],
] as const;

const TELETRABAJO_MARKER_MAP = [
  ['«Nombre_Completo»', 'nombreCompleto'],
  ['«Numero_Empleado»', 'employeeNumber'],
  ['«Número_Empleado»', 'employeeNumber'],
  ['«Tipo_Solicitud»', 'tipoSolicitud'],
  ['«DNI»', 'dni'],
  ['«Puesto_CAST»', 'puestoCast'],
  ['«Puesto_EUS»', 'puestoEus'],
  ['«Dirección»', 'direccionTeletrabajo'],
  ['«Residencia_CAST»', 'residenciaCast'],
  ['«Residencia_EUS»', 'residenciaEus'],
  ['«Días_Teletrabajo_CAST»', 'diasTeletrabajoCast'],
  ['«Días_Teletrabajo_EUS»', 'diasTeletrabajoEus'],
  ['«Porcentaje»', 'porcentajeTeletrabajo'],
  ['«Fecha_Ordenador»', 'fechaOrdenadorFormatted'],
  ['«Fecha_Cascos»', 'fechaCascosFormatted'],
  ['«Fecha_Inicio_Teletrabajo_CAST»', 'fechaInicioTeletrabajoCastFormatted'],
  ['«Fecha_Fin_Teletrabajo_CAST»', 'fechaFinTeletrabajoCastFormatted'],
  ['«Fecha_Inicio_Teletrabajo_EUS»', 'fechaInicioTeletrabajoEusFormatted'],
  ['«Fecha_Fin_Teletrabajo_EUS»', 'fechaFinTeletrabajoEusFormatted'],
  ['«Fecha_Periodo_CAST»', 'fechaPeriodoCast'],
  ['«Fecha_Actual»', 'currentDateNumeric'],
  ['«Fecha_Actual_EUS»', 'currentDateEusNumeric'],
  ['«M_1ºdata»', 'fechaInicioTeletrabajoEusFormatted'],
  ['«M_2ºdata»', 'fechaFinTeletrabajoEusFormatted'],
  ['M_1ºdata', 'fechaInicioTeletrabajoEusFormatted'],
  ['M_2ºdata', 'fechaFinTeletrabajoEusFormatted'],
] as const;

export const TELETRABAJO_WORD_MARKER_SOURCES: readonly TeletrabajoWordMarkerMapping[] =
  TELETRABAJO_MARKER_MAP.map(([marker, source]) => ({ marker, source }));

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

function datesFromPeriod(period: string): { start: string; end: string } {
  const match = period.trim().match(/(20\d{2})\D+(20\d{2})/);
  if (!match) return { start: '', end: '' };
  return { start: `${match[1]}-09-01`, end: `${match[2]}-06-30` };
}

function formatDateCast(value: string): string {
  const parts = parseDateOnly(value);
  if (!parts) return value.trim();
  return `${parts.day} de ${MONTHS_CAST[parts.month - 1]} de ${parts.year}`;
}

function formatDateEus(value: string): string {
  const parts = parseDateOnly(value);
  if (!parts) return value.trim();
  return `${parts.year}ko ${MONTHS_EUS[parts.month - 1]} ${parts.day}a`;
}

function formatDateNumeric(value: string): string {
  const parts = parseDateOnly(value);
  if (!parts) return value.trim();
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
}

function formatDateEusNumeric(value: string): string {
  const parts = parseDateOnly(value);
  if (!parts) return value.trim();
  return `${parts.year}/${String(parts.month).padStart(2, '0')}/${String(parts.day).padStart(2, '0')}`;
}

function formatDatePeriodCast(startValue: string, endValue: string): string {
  const start = formatDateCast(startValue);
  const end = formatDateCast(endValue);
  if (start && end) return `${start} y el ${end}`;
  return start || end || '';
}

function docxReplacementXml(value: string): string {
  return String(value ?? '')
    .split(/\r\n|\r|\n/)
    .map(escapeXml)
    .join('</w:t><w:br/><w:t>');
}

function normalizeTipoSolicitud(value: string): string {
  if (value === 'renovacion') return 'Renovación';
  if (value === 'nueva') return 'Nueva solicitud';
  return value;
}

function joinDays(days: readonly TeletrabajoDia[], language: 'cast' | 'eus'): string {
  return days.map((day) => DAY_LABELS[day][language]).join(', ');
}

function percentageFromDays(days: readonly TeletrabajoDia[]): string {
  return `${days.length * 20}%`;
}

function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
}

function buildTeletrabajoData(
  source: TeletrabajoWordSource,
  plantillaEmployee: Employee | null,
  now = new Date(),
): Record<string, string> {
  const periodDates = datesFromPeriod(source.periodo);
  const fechaInicioTeletrabajoCast = periodDates.start;
  const fechaFinTeletrabajoCast = periodDates.end;
  const fechaInicioTeletrabajoEus = periodDates.start;
  const fechaFinTeletrabajoEus = periodDates.end;
  const currentIso = todayIso(now);
  const puesto = plantillaEmployee?.puestoNomina || source.puestoNomina || source.puestoOrganizativo;

  return {
    nombreCompleto: source.nombreApellidos || plantillaEmployee?.nombreApellidos || '',
    employeeNumber: source.empleado || plantillaEmployee?.empleado || '',
    tipoSolicitud: normalizeTipoSolicitud(source.tipoSolicitud),
    dni: plantillaEmployee?.dni || source.dni || '',
    puestoCast: puesto,
    puestoEus: plantillaEmployee?.puestoEus || puesto,
    direccionTeletrabajo: plantillaEmployee?.direccionTeletrabajo || source.direccionTeletrabajo || '',
    residenciaCast: plantillaEmployee?.residenciaCast || source.residencia || '',
    residenciaEus: plantillaEmployee?.residenciaEus || plantillaEmployee?.residenciaCast || source.residencia || '',
    diasTeletrabajoCast: joinDays(source.diasTeletrabajo, 'cast'),
    diasTeletrabajoEus: joinDays(source.diasTeletrabajo, 'eus'),
    porcentajeTeletrabajo: percentageFromDays(source.diasTeletrabajo),
    fechaOrdenadorFormatted: '',
    fechaCascosFormatted: '',
    fechaInicioTeletrabajoCast,
    fechaFinTeletrabajoCast,
    fechaInicioTeletrabajoEus,
    fechaFinTeletrabajoEus,
    fechaInicioTeletrabajoCastFormatted: formatDateCast(fechaInicioTeletrabajoCast),
    fechaFinTeletrabajoCastFormatted: formatDateCast(fechaFinTeletrabajoCast),
    fechaInicioTeletrabajoEusFormatted: formatDateEus(fechaInicioTeletrabajoEus),
    fechaFinTeletrabajoEusFormatted: formatDateEus(fechaFinTeletrabajoEus),
    fechaPeriodoCast: formatDatePeriodCast(fechaInicioTeletrabajoCast, fechaFinTeletrabajoCast),
    currentDateNumeric: formatDateNumeric(currentIso),
    currentDateEusNumeric: formatDateEusNumeric(currentIso),
    currentDateCast: formatDateCast(currentIso),
    currentDateEus: formatDateEus(currentIso),
  };
}

function validateTeletrabajoData(data: Record<string, string>): string[] {
  return TELETRABAJO_REQUIRED_FIELDS.filter(([key]) => !String(data[key] ?? '').trim()).map(
    ([, label]) => label,
  );
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
    .sort((left, right) => left.index - right.index || right.end - right.index - (left.end - left.index))
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

function sourceDescription(marker: string): string {
  return TELETRABAJO_WORD_MARKER_SOURCES.find((mapping) => mapping.marker === marker)?.source ?? '';
}

function buildFileName(source: TeletrabajoWordSource): string {
  const fullName = source.nombreApellidos.trim();
  const sanitize = (value: string, fallback: string): string =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9_-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '') || fallback;

  if (fullName.includes(',')) {
    const [surnames, givenName] = fullName.split(',', 2).map((part) => part.trim());
    const [surname1 = 'SinApellido1', surname2 = 'SinApellido2'] = surnames.split(/\s+/);
    return `Teletrabajo_${sanitize(surname1, 'SinApellido1')}_${sanitize(
      surname2,
      'SinApellido2',
    )}_${sanitize(givenName, 'SinNombre')}.docx`;
  }

  return `Teletrabajo_${sanitize(fullName, source.empleado.trim() || 'SinNombre')}.docx`;
}

async function readTemplateFromConfiguredPath(path: string): Promise<ArrayBuffer> {
  const templatePath = validateConfiguredTeletrabajoTemplatePath(path);

  if (!window.traccion?.readTeletrabajoTemplate) {
    throw new Error(TELETRABAJO_TEMPLATE_UNAVAILABLE_MESSAGE);
  }

  try {
    return await window.traccion.readTeletrabajoTemplate(templatePath);
  } catch {
    throw new Error(TELETRABAJO_TEMPLATE_UNAVAILABLE_MESSAGE);
  }
}

export async function detectTeletrabajoWordMarkers(templateBuffer: ArrayBuffer): Promise<string[]> {
  const entries = await unzipDocx(templateBuffer);
  const markers = new Set<string>();

  entries.forEach((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return;
    const xml = textDecoder.decode(entry.data);
    TELETRABAJO_MARKER_MAP.forEach(([marker]) => {
      if (xml.includes(marker)) markers.add(marker);
    });
  });

  return [...markers].sort((left, right) => left.localeCompare(right));
}

export async function generateTeletrabajoWord(
  source: TeletrabajoWordSource,
  plantillaEmployee: Employee | null,
  templatePath: string,
): Promise<TeletrabajoWordResult> {
  const templateBuffer = await readTemplateFromConfiguredPath(templatePath);
  const entries = await unzipDocx(templateBuffer);
  const data = buildTeletrabajoData(source, plantillaEmployee);
  const missing = validateTeletrabajoData(data);

  if (missing.length) {
    throw new Error(`No se puede generar el acuerdo. Faltan datos obligatorios: ${missing.join(', ')}.`);
  }

  const replacements = new Map(
    TELETRABAJO_MARKER_MAP.map(([marker, key]) => [marker, docxReplacementXml(data[key])]),
  );
  const foundMarkers = new Set<string>();
  const outputEntries: ZipEntry[] = entries.map((entry) => {
    if (!/^word\/.*\.xml$/i.test(entry.name)) return entry;
    const xml = textDecoder.decode(entry.data);
    const updated = replaceMarkersInTextNodes(xml, replacements, foundMarkers);
    return updated === xml ? entry : { ...entry, data: textEncoder.encode(updated) };
  });
  const detectedMarkers = [...foundMarkers].map((marker) => ({ marker, source: sourceDescription(marker) }));
  const emptyMarkers = detectedMarkers.filter((mapping) => !data[mapping.source]);

  return {
    fileName: buildFileName(source),
    blob: new Blob([zipDocx(outputEntries).buffer as ArrayBuffer], { type: WORD_MIME_TYPE }),
    detectedMarkers,
    emptyMarkers,
  };
}
