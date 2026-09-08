import { addCalendarDays, toLocalIsoDate } from '../../../utils/dateOnly';
import type { ExportColumn } from '../../../shared/export/types';
import type { ModuleHelpSection } from '../../../components/ModuleHelp';
import { relativeDate } from '../../../utils/relativeDate';
import { readStorageItem, writeSharedStorageItemAsync } from '../../../services/persistence';
import { type Acta, type ActaAlegacion, type ActaDraft } from '../domain/acta';

// Funciones y constantes puras extraídas de ActasPage.tsx para reducir el
// tamaño del componente principal. Nada aquí depende de hooks de React ni
// de estado local del componente; todo recibe sus datos por parámetro.

export const ACTAS_OUTLOOK_TEMPLATE_STORAGE_KEY = 'traccion.v1.actas.outlookTemplate';

export interface ActasOutlookTemplate {
  subject: string;
  bodyHtml: string;
}

export const EMPTY_ACTAS_OUTLOOK_TEMPLATE: ActasOutlookTemplate = {
  subject: '',
  bodyHtml: '',
};

export function stripHtmlToText(value: string): string {
  if (!value) {
    return '';
  }

  if (typeof window !== 'undefined' && window.document) {
    const element = window.document.createElement('div');
    element.innerHTML = value;
    return element.textContent?.trim() ?? '';
  }

  return value.replace(/<[^>]*>/g, '').trim();
}

export function isMeaningfulHtml(value: string): boolean {
  return stripHtmlToText(value).length > 0 || /<img\s/i.test(value);
}

export function buildDefaultActaOutlookSubject(
  acta: Pick<Acta, 'titulo' | 'tipo' | 'fechaSesion' | 'fechaLimite'>,
): string {
  return `Acta ${acta.titulo}`.trim();
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

export function formatActaLongDateEs(value: string): string {
  if (!value) return '—';
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatActaLongDateEu(value: string): string {
  if (!value) return '—';
  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!year || month < 1 || month > 12 || !day) return value;
  return `${year}ko ${BASQUE_MONTHS[month - 1]} ${day}a`;
}

export function buildBorradorActaOutlookSubject(acta: Pick<Acta, 'titulo'>): string {
  return `Akta Zirriborroa/Borrador Acta - ${acta.titulo}`.trim();
}

export function buildBorradorActaOutlookHtml(
  acta: Pick<Acta, 'titulo' | 'fechaSesion'>,
  todayIso = getTodayIsoDate(),
): string {
  const deadlineIso = addDaysToIsoDate(todayIso, 21);
  const title = escapeTemplateHtml(acta.titulo);
  const sessionDateEu = escapeTemplateHtml(formatActaLongDateEu(acta.fechaSesion));
  const sessionDateEs = escapeTemplateHtml(formatActaLongDateEs(acta.fechaSesion));
  const deadlineEu = escapeTemplateHtml(formatActaLongDateEu(deadlineIso));
  const deadlineEs = escapeTemplateHtml(formatActaLongDateEs(deadlineIso));
  const email = 'RELACIONES_LABORALES@metrobilbao.eus';

  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.25;color:#000000;">
  <tr>
    <td valign="top" style="width:50%;padding:0 22px 0 0;">
      <p style="margin:0 0 10px 0;">Kaixo,</p>
      <p style="margin:0 0 10px 0;">Honekin batera, “${title}” bileraren aktaren <strong>ZIRRIBORROA</strong> bidaltzen da:</p>
      <ul style="margin:0 0 12px 22px;padding:0;"><li>${sessionDateEu}</li></ul>
      <p style="margin:0 0 12px 0;">Mesedez, bidali zuen <strong>ekarpenak</strong> <a href="mailto:${email}">${email}</a> helbidera, <strong>${deadlineEu} baino lehen</strong>, sinatu eta argitaratzeko.</p>
      <p style="margin:0;">Ondo izan</p>
    </td>
    <td valign="top" style="width:50%;padding:0 0 0 22px;">
      <p style="margin:0 0 10px 0;">Adjunto remito <strong>BORRADOR</strong> del acta de reunión de “${title}” que se celebró:</p>
      <ul style="margin:0 0 12px 22px;padding:0;"><li>${sessionDateEs}</li></ul>
      <p style="margin:0 0 12px 0;">Por favor, hacernos llegar vuestras <strong>aportaciones</strong> a <a href="mailto:${email}">${email}</a>, <strong>antes del ${deadlineEs}</strong>, con el objeto de firmarla y publicarla.</p>
    </td>
  </tr>
</table>`.trim();
}

export function isActasOutlookTemplate(value: unknown): value is ActasOutlookTemplate {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ActasOutlookTemplate>;
  return typeof candidate.subject === 'string' && typeof candidate.bodyHtml === 'string';
}

export function loadActasOutlookTemplate(): ActasOutlookTemplate {
  if (typeof window === 'undefined') {
    return EMPTY_ACTAS_OUTLOOK_TEMPLATE;
  }

  const stored = readStorageItem(ACTAS_OUTLOOK_TEMPLATE_STORAGE_KEY);
  if (!stored) {
    return EMPTY_ACTAS_OUTLOOK_TEMPLATE;
  }

  try {
    const parsed = JSON.parse(stored) as unknown;
    return isActasOutlookTemplate(parsed) ? parsed : EMPTY_ACTAS_OUTLOOK_TEMPLATE;
  } catch {
    return EMPTY_ACTAS_OUTLOOK_TEMPLATE;
  }
}

export async function saveActasOutlookTemplate(template: ActasOutlookTemplate): Promise<void> {
  const result = await writeSharedStorageItemAsync(
    ACTAS_OUTLOOK_TEMPLATE_STORAGE_KEY,
    JSON.stringify(template),
  );

  if (!result.ok) {
    throw new Error(result.message || 'No se ha confirmado el guardado de la plantilla Outlook.');
  }
}

export function escapeTemplateHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatIsoDateWithPattern(value: string, pattern: string): string {
  if (!value) {
    return '';
  }

  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }

  if (pattern === 'DD/MM/AAAA') {
    return `${day}/${month}/${year}`;
  }

  if (pattern === 'AAAA/MM/DD') {
    return `${year}/${month}/${day}`;
  }

  return value;
}

export function replaceActaTemplateMarkers(
  template: string,
  acta: Pick<Acta, 'titulo' | 'tipo' | 'fechaSesion' | 'fechaLimite'>,
  mode: 'plain' | 'html',
): string {
  const mapValue = (value: string): string => (mode === 'html' ? escapeTemplateHtml(value) : value);
  const replacements = new Map<string, string>([
    ['[Título Acta]', mapValue(acta.titulo)],
    ['[Tipo Acta]', mapValue(acta.tipo)],
    [
      '[Fecha Acta formato DD/MM/AAAA]',
      mapValue(formatIsoDateWithPattern(acta.fechaSesion, 'DD/MM/AAAA')),
    ],
    [
      '[Fecha Acta formato AAAA/MM/DD]',
      mapValue(formatIsoDateWithPattern(acta.fechaSesion, 'AAAA/MM/DD')),
    ],
    [
      '[Fecha Límite formato AAAA/MM/DD]',
      mapValue(formatIsoDateWithPattern(acta.fechaLimite, 'AAAA/MM/DD')),
    ],
    [
      '[Fecha Límite formato DD/MM/AAAA]',
      mapValue(formatIsoDateWithPattern(acta.fechaLimite, 'DD/MM/AAAA')),
    ],
  ]);

  let result = template;
  for (const [marker, value] of replacements) {
    result = result.split(marker).join(value);
  }
  return result;
}

export const ACTAS_HELP_SECTIONS: ModuleHelpSection[] = [
  {
    title: 'Pantalla principal',
    items: [
      'La pantalla inicial se usa como centro de trabajo: desde ahí puedes crear una nueva acta, continuar una abierta, entrar en la vista operativa y abrir la ayuda del módulo.',
      'El bloque “Configuración rápida” permite acceder directamente a “Tipos de acta” y a la plantilla de Outlook, que antes quedaban menos visibles.',
      'Las bandejas de trabajo agrupan las actas por fase (pendientes, borradores, alegaciones y firma) para entrar con un clic al punto exacto del proceso.',
    ],
  },
  {
    title: '¿Qué hace este módulo?',
    body: 'Gestiona el seguimiento completo de un acta: alta, borrador, envío a Dirección, alegaciones, firma y archivo, con avisos de plazo automáticos. Las actas de Comité y Paritaria se pueden generar directamente al cerrar la sesión correspondiente en esos módulos.',
  },
  {
    title: 'Correo del borrador',
    items: [
      'Cuando el acta está en estado “Borrador” aparece la acción “Generar Outlook”.',
      'El asunto se genera como “Akta Zirriborroa/Borrador Acta - {nombre del acta}”.',
      'El cuerpo se crea en dos columnas, euskera y castellano, con el nombre del acta y la fecha de sesión.',
      'La fecha tope para recibir aportaciones se calcula en el momento de generar el correo como fecha del sistema + 21 días y se escribe en cada idioma.',
      'El correo se abre como borrador de Outlook: no se envía automáticamente y los destinatarios quedan para completar manualmente.',
    ],
  },
  {
    title: 'Estados y plazos automáticos',
    items: [
      'Pendiente de realizar → Borrador → Enviada a Dirección → Pendiente de alegaciones → Pendiente de firma → Cerrada.',
      'Al pasar a "Enviada a Dirección" se propone automáticamente una fecha límite a 7 días.',
      'Al pasar a "Pendiente de alegaciones" se propone una fecha límite a 21 días.',
      'Al pasar a "Pendiente de firma" se propone una fecha límite a 14 días.',
      'La fecha propuesta se puede corregir a mano en cualquier momento; no se recalcula sola si luego se cambia manualmente.',
    ],
  },
  {
    title: 'Alegaciones',
    items: [
      'Cada acta puede tener varias alegaciones, una por sindicato, marcando si ha sido presentada, su fecha y una observación.',
      'En estado "Pendiente de alegaciones" se puede abrir un borrador de Outlook con una plantilla configurable (con marcadores que se sustituyen por los datos del acta) para reclamar alegaciones a los sindicatos.',
      'También se puede crear directamente una cita de Outlook "FIN ALEGACIONES {título}" en la fecha límite, para no perder de vista el plazo.',
    ],
  },
  {
    title: 'Cierre y archivo',
    items: [
      'En "Pendiente de firma" o "Cerrada" se puede adjuntar la ruta del documento del acta ya firmada.',
      'Las actas cerradas quedan protegidas en modo consulta dentro del histórico; si hay que corregir una, se usa la acción explícita “Reabrir acta”, que la devuelve a Pendiente de firma.',
      'Los tipos de acta (por defecto Comité y Paritaria) se pueden ampliar o desactivar desde el botón "Nuevo tipo", sin perder las actas ya creadas con un tipo desactivado.',
    ],
  },
  {
    title: 'Flujo recomendado',
    ordered: true,
    items: [
      'Crear el acta desde la sesión de Comité/Paritaria correspondiente, o manualmente indicando tipo, título y fecha de sesión.',
      'Pasarla a Borrador cuando el documento externo esté disponible.',
      'Avanzar el estado a medida que progresa el trámite; revisar la fecha límite propuesta en cada cambio.',
      'Registrar alegaciones por sindicato cuando proceda.',
      'Adjuntar la ruta del acta firmada al cerrar el ciclo.',
      'Consultar el histórico por año cuando el acta ya no esté abierta.',
    ],
  },
];

export type ActaColumnId =
  | 'tipo'
  | 'fechaSesion'
  | 'fechaCreacion'
  | 'titulo'
  | 'estado'
  | 'fechaLimite'
  | 'actaPath'
  | 'alegaciones'
  | 'acciones';

export const validColumnIds: ActaColumnId[] = [
  'tipo',
  'fechaSesion',
  'fechaCreacion',
  'titulo',
  'estado',
  'fechaLimite',
  'actaPath',
  'alegaciones',
  'acciones',
];

export const actaExportColumns: ExportColumn<Acta>[] = [
  { key: 'tipo', header: 'Tipo', value: (acta) => acta.tipo },
  { key: 'fechaSesion', header: 'Fecha sesión', value: (acta) => acta.fechaSesion || null },
  { key: 'fechaCreacion', header: 'Fecha creación', value: (acta) => acta.fechaCreacion || null },
  { key: 'titulo', header: 'Título', value: (acta) => acta.titulo },
  { key: 'estado', header: 'Estado', value: (acta) => acta.estado },
  { key: 'fechaLimite', header: 'Fecha límite', value: (acta) => acta.fechaLimite || null },
  { key: 'actaPath', header: 'Ruta acta', value: (acta) => acta.actaPath || null },
  { key: 'observaciones', header: 'Observaciones', value: (acta) => acta.observaciones || null },
  {
    key: 'actualizaciones',
    header: 'Actualizaciones',
    value: (acta) =>
      acta.actualizaciones.map((entry) => `${entry.fecha}: ${entry.texto}`).join('\n') || null,
  },
  {
    key: 'alegaciones',
    header: 'Alegaciones',
    value: (acta) =>
      acta.alegaciones
        .map(
          (alegacion) =>
            `${alegacion.sindicato}: ${alegacion.presentada ? 'presentada' : 'no presentada'}${
              alegacion.fecha ? ` (${alegacion.fecha})` : ''
            }${alegacion.observacion ? ` - ${alegacion.observacion}` : ''}`,
        )
        .join('\n') || null,
  },
];

export function getActaYear(acta: Acta): string {
  return acta.fechaSesion.slice(0, 4) || acta.fechaCreacion.slice(0, 4) || 'Sin año';
}

export function getClosedYear(acta: Acta): string {
  return (acta.closedAt ?? acta.fechaSesion ?? acta.fechaCreacion).slice(0, 4) || 'Sin año';
}

export function matchesSearch(acta: Acta, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    acta.titulo,
    acta.tipo,
    acta.estado,
    acta.fechaSesion,
    acta.fechaLimite,
    acta.observaciones,
    acta.actaPath,
    ...acta.actualizaciones.map((entry) => entry.texto),
    ...acta.alegaciones.flatMap((alegacion) => [
      alegacion.sindicato,
      alegacion.fecha,
      alegacion.observacion,
      alegacion.presentada ? 'presentada' : 'no presentada',
    ]),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedSearch);
}

export function createEmptyAlegacion(sindicato = ''): ActaAlegacion {
  return { sindicato, presentada: false, fecha: '', observacion: '' };
}

export function formatDate(value: string): string {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' }).format(
      new Date(`${value}T00:00:00`),
    );
  } catch {
    return value;
  }
}

export function getTodayIsoDate(): string {
  return toLocalIsoDate();
}

export function addDaysToIsoDate(value: string, days: number): string {
  return addCalendarDays(value, days);
}

export function getActaStateBadgeClass(state: ActaDraft['estado']): string {
  if (state === 'Pendiente de realizar') {
    return 'border-orange-400/40 bg-orange-500/15 text-orange-200';
  }
  if (state === 'Borrador') {
    return 'border-blue-400/40 bg-blue-500/15 text-blue-200';
  }
  if (state === 'Enviada a Dirección') {
    return 'border-sky-400/40 bg-sky-500/15 text-sky-200';
  }
  if (state === 'Pendiente de alegaciones') {
    return 'border-yellow-400/40 bg-yellow-500/15 text-yellow-100';
  }
  if (state === 'Pendiente de firma') {
    return 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';
  }
  return 'border-metro-border bg-metro-panel text-metro-muted';
}

export function renderActaStateBadge(state: ActaDraft['estado']) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-bold ${getActaStateBadgeClass(state)}`}
    >
      {state}
    </span>
  );
}

export function getDeadlineStatusClass(value: string): string {
  if (!value) {
    return 'text-metro-muted';
  }

  const today = new Date(`${getTodayIsoDate()}T00:00:00`);
  const deadline = new Date(`${value}T00:00:00`);
  const diffDays = Math.floor((deadline.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    return 'border-red-400/45 bg-red-500/15 text-red-200';
  }

  if (diffDays < 3) {
    return 'border-yellow-400/45 bg-yellow-500/15 text-yellow-100';
  }

  return 'border-metro-border bg-metro-panel text-metro-text';
}

export function renderDeadlineBadge(value: string) {
  if (!value) {
    return <span className="text-metro-muted">—</span>;
  }

  const relative = relativeDate(value);

  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-xs font-bold ${getDeadlineStatusClass(value)}`}
      title={formatDate(value)}
    >
      {value}
      {relative && <span className="ml-1.5 font-semibold opacity-70">{relative}</span>}
    </span>
  );
}

export function getAutomaticDeadlineForState(
  state: ActaDraft['estado'],
  changedAt = getTodayIsoDate(),
): string | null {
  if (state === 'Enviada a Dirección') {
    return addDaysToIsoDate(changedAt, 7);
  }
  if (state === 'Pendiente de alegaciones') {
    return addDaysToIsoDate(changedAt, 21);
  }
  if (state === 'Pendiente de firma') {
    return addDaysToIsoDate(changedAt, 14);
  }
  return null;
}

export function formatDateTime(value: string): string {
  if (!value) {
    return '—';
  }

  try {
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function getNextState(state: ActaDraft['estado']): ActaDraft['estado'] | null {
  if (state === 'Pendiente de realizar') {
    return 'Borrador';
  }
  if (state === 'Borrador') {
    return 'Enviada a Dirección';
  }
  if (state === 'Enviada a Dirección') {
    return 'Pendiente de alegaciones';
  }
  if (state === 'Pendiente de alegaciones') {
    return 'Pendiente de firma';
  }
  if (state === 'Pendiente de firma') {
    return 'Cerrada';
  }
  return null;
}

export function getNextStateLabel(state: ActaDraft['estado']): string {
  const nextState = getNextState(state);
  return nextState ? `Pasar a ${nextState}` : 'Acta cerrada';
}
