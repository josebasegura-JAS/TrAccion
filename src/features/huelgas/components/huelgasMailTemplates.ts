import type { HuelgaPuestoAsignacion } from './huelgasAssignments';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';
import type { HuelgaZona } from './huelgasZones';

export const HUELGA_MAIL_MARKERS = [
  '{{FECHA_HUELGA}}',
  '{{FECHA_HUELGA_LARGA}}',
  '{{ZONA}}',
  '{{RESPONSABLE}}',
  '{{AREAS}}',
  '{{PUESTOS}}',
  '{{COLECTIVOS}}',
  '{{TOTAL_PERSONAS}}',
  '{{PLAZOS_RECOGIDA}}',
  '{{INSTRUCCIONES_HABITUALES}}',
  '{{INSTRUCCIONES_ESPECIFICAS}}',
] as const;

export const DEFAULT_HUELGA_MAIL_SUBJECT = 'Petición Datos Huelga {{FECHA_HUELGA}} - {{ZONA}}';

export const DEFAULT_HUELGA_MAIL_BODY = `<p>Kaixo,</p>
<p>Adjunto os envío la información a utilizar para los datos correspondientes a la huelga del <strong>{{FECHA_HUELGA_LARGA}}</strong>.</p>
<p>Los datos solicitados corresponden a los siguientes colectivos:</p>
{{COLECTIVOS}}
<p>{{PLAZOS_RECOGIDA}}</p>
<p>{{INSTRUCCIONES_HABITUALES}}</p>
<p>{{INSTRUCCIONES_ESPECIFICAS}}</p>
<p>Enviar los datos al siguiente correo: <strong>RELACIONES_LABORALES@metrobilbao.eus</strong>.</p>
<p>Es importante identificar correctamente:</p>
<ol>
<li>Personas que tienen turno.</li>
<li>Personas con servicios mínimos.</li>
<li>Personas que realizan huelga y personas que trabajan.</li>
</ol>
<p>Ruego nos remitas también la relación del personal —número de empleado y nombre y apellidos— de las personas que realizan <strong>HUELGA</strong>.</p>
<p><strong>IMPORTANTE:</strong></p>
<p><strong>Personas con turno:</strong> son las personas que tienen asignado turno de trabajo independientemente de que secunden o no la huelga.</p>
<p><strong>Personas que trabajan:</strong> son las personas que <strong>NO</strong> secundan la huelga y no tienen asignado Servicio Mínimo.</p>
<p>Las personas que están de servicios mínimos están incluidas en personas con turno, pero no están incluidas en personas que trabajan.</p>
<p>Si tienes alguna duda estoy a tu entera disposición.</p>
<p>Un cordial saludo.</p>`;

const DEFAULT_DEADLINES: Record<string, string> = {
  'mm ariz': 'Es muy importante que antes de las 9:45 horas se tengan los datos del personal que ha trabajado.',
  'mm sopela': 'Es muy importante que antes de las 7:45 horas se tengan los datos del personal que ha trabajado.',
  'gmo y linea': 'Es muy importante que antes de las 9:45 horas se tengan los datos del personal de mañana y antes de las 15:00 horas los del personal de tarde.',
  instalaciones: 'Es muy importante que antes de las 8:30 horas se tengan los datos del personal de mañana y noche, y antes de las 15:00 horas los del personal de tarde.',
  oacs: 'Es muy importante que antes de las 9:45 horas se tengan los datos del personal de mañana y antes de las 15:00 horas los del personal de tarde.',
  pmc: 'Es muy importante que antes de las 9:00 horas se tengan los datos del personal de noche y mañana, y antes de las 15:00 horas los del personal de tarde.',
  'jefatura de operaciones': 'Es muy importante que antes de las 10:30 horas se tengan los datos del personal de mañana y jornada partida, y antes de las 15:00 horas los del personal de tarde.',
};

function normalizeKey(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/\s+/g, ' ')
    .trim();
}

export function defaultDeadlineForZone(name: string): string {
  return DEFAULT_DEADLINES[normalizeKey(name)] ?? '';
}

export function defaultMailEnabledForZone(name: string): boolean {
  return normalizeKey(name) !== 'sscc';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateLong(fecha: string): string {
  const [year, month, day] = fecha.split('-').map(Number);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function formatDateShort(fecha: string): string {
  const [year, month, day] = fecha.split('-');
  return `${day}/${month}/${year}`;
}

function personalResidence(persona: HuelgaPersonalTurno): string {
  return (
    persona.residenciaAsignacion ||
    persona.residenciaPlantilla ||
    persona.residenciaEstacion ||
    ''
  ).trim();
}

export type HuelgaMailRenderContext = {
  fecha: string;
  zona: HuelgaZona;
  personal: HuelgaPersonalTurno[];
  asignaciones: HuelgaPuestoAsignacion[];
  instruccionesEspecificas?: string;
};

function buildAreas(context: HuelgaMailRenderContext): string[] {
  return [...new Set(context.asignaciones.map((item) => item.area.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function buildPuestos(context: HuelgaMailRenderContext): string[] {
  return [...new Set(context.asignaciones.map((item) => item.puesto.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function buildColectivosHtml(context: HuelgaMailRenderContext): string {
  const rows = context.asignaciones.map((assignment) => {
    const count = context.personal.filter((persona) => {
      return personalResidence(persona).localeCompare(assignment.residencia, 'es', { sensitivity: 'base' }) === 0
        && persona.puesto.localeCompare(assignment.puesto, 'es', { sensitivity: 'base' }) === 0;
    }).length;
    const parts = [assignment.area, assignment.puesto, assignment.residencia].filter(Boolean);
    return `<li>${parts.map(escapeHtml).join(' · ')}${count ? ` <strong>(${count} ${count === 1 ? 'persona' : 'personas'})</strong>` : ''}</li>`;
  });
  return `<ul>${rows.join('')}</ul>`;
}

function plainTextToHtml(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
}

export function renderHuelgaMailTemplate(context: HuelgaMailRenderContext): { subject: string; html: string } {
  const areas = buildAreas(context);
  const puestos = buildPuestos(context);
  const replacements: Record<string, string> = {
    '{{FECHA_HUELGA}}': escapeHtml(formatDateShort(context.fecha)),
    '{{FECHA_HUELGA_LARGA}}': escapeHtml(formatDateLong(context.fecha)),
    '{{ZONA}}': escapeHtml(context.zona.nombre),
    '{{RESPONSABLE}}': escapeHtml(context.zona.responsableNombre || ''),
    '{{AREAS}}': escapeHtml(areas.join(', ')),
    '{{PUESTOS}}': escapeHtml(puestos.join(', ')),
    '{{COLECTIVOS}}': buildColectivosHtml(context),
    '{{TOTAL_PERSONAS}}': String(context.personal.length),
    '{{PLAZOS_RECOGIDA}}': plainTextToHtml(context.zona.correoPlazos || ''),
    '{{INSTRUCCIONES_HABITUALES}}': plainTextToHtml(context.zona.correoInstruccionesHabituales || ''),
    '{{INSTRUCCIONES_ESPECIFICAS}}': plainTextToHtml(context.instruccionesEspecificas || ''),
  };

  let subject = context.zona.correoAsunto || DEFAULT_HUELGA_MAIL_SUBJECT;
  let html = context.zona.correoCuerpoHtml || DEFAULT_HUELGA_MAIL_BODY;
  for (const [marker, value] of Object.entries(replacements)) {
    subject = subject.split(marker).join(value.replace(/<[^>]*>/g, ''));
    html = html.split(marker).join(value);
  }
  return { subject, html };
}
