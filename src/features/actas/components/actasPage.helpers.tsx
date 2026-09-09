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
<table role="presentation" width="800" cellpadding="0" cellspacing="0" border="0" style="width:800px;table-layout:fixed;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:Verdana,Arial,sans-serif;font-size:10pt;line-height:1.2;color:#000000;">
  <tr>
    <td width="370" valign="top" style="width:370px;padding:0;">
      <p style="margin:0 0 10px 0;">Kaixo,</p>
      <p style="margin:0 0 10px 0;">Honekin batera, “${title}” bileraren aktaren <strong>ZIRRIBORROA</strong> bidaltzen da:</p>
      <ul style="margin:0 0 12px 22px;padding:0;"><li>${sessionDateEu}</li></ul>
      <p style="margin:0 0 12px 0;">Mesedez, bidali zuen <strong>ekarpenak</strong> <a href="mailto:${email}">${email}</a> helbidera, <strong>${deadlineEu} baino lehen</strong>, sinatu eta argitaratzeko.</p>
      <p style="margin:0;">Ondo izan</p>
    </td>
    <td width="35" style="width:35px;font-size:1px;line-height:1px;">&nbsp;</td>
    <td width="395" valign="top" style="width:395px;padding:12px 0 0 0;">
      <p style="margin:0 0 10px 0;">Adjunto remito <strong>BORRADOR</strong> del acta de reunión de “${title}” que se celebró:</p>
      <ul style="margin:0 0 12px 22px;padding:0;"><li>${sessionDateEs}</li></ul>
      <p style="margin:0 0 12px 0;">Por favor, hacernos llegar vuestras <strong>aportaciones</strong> a <a href="mailto:${email}">${email}</a>, <strong>antes del ${deadlineEs}</strong>, con el objeto de firmarla y publicarla.</p>
    </td>
  </tr>
</table>`.trim();
}

export function buildFirmaActaOutlookSubject(acta: Pick<Acta, 'titulo'>): string {
  return `Behin betiko Akta/Acta Definitiva Acta - ${acta.titulo}`.trim();
}

export function buildFirmaActaOutlookHtml(): string {
  return `
<table role="presentation" width="800" cellpadding="0" cellspacing="0" border="0" style="width:800px;table-layout:fixed;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;font-family:Verdana,Arial,sans-serif;font-size:10pt;line-height:1.2;color:#000000;">
  <tr>
    <td width="370" valign="top" style="width:370px;padding:0;">
      <p style="margin:0 0 10px 0;">Kaixo,</p>
      <p style="margin:0 0 12px 0;">Ekarpenak egiteko epea bete ondoren, honekin batera bidaltzen dizuegu behin betiko akta, ekarpenak koloreekin nabarmenduta.</p>
      <p style="margin:0 0 12px 0;">Jarraian akta bidaliko zaizue firma digitala egiteko.</p>
      <p style="margin:0;">Ondo izan</p>
    </td>
    <td width="35" style="width:35px;font-size:1px;line-height:1px;">&nbsp;</td>
    <td width="395" valign="top" style="width:395px;padding:12px 0 0 0;">
      <p style="margin:0 0 12px 0;">Una vez cumplido el plazo para las aportaciones, adjunto remito el acta definitiva con las aportaciones remarcadas en color.</p>
      <p style="margin:0 0 12px 0;">A continuación se os enviará el acta para realizar la firma digital.</p>
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
      'La pantalla inicial muestra las actas abiertas agrupadas en tres bandejas: Pendientes de realizar, Pendientes de alegaciones y Pendientes de firma.',
      'Cada fila muestra el título y la fecha límite del estado actual. Pulsa cualquier acta para abrirla y seguir trabajando.',
      'Desde la cabecera puedes crear una nueva acta, gestionar tipos de acta y consultar el histórico.',
    ],
  },
  {
    title: 'Flujo real de trabajo',
    body: 'El ciclo se ha simplificado para ajustarse al trabajo real: alta del acta, envío del borrador con apertura del plazo de alegaciones, envío del acta definitiva para firma y cierre cuando queda firmada.',
    flowSteps: [
      {
        title: 'Pendiente de realizar',
        action: 'Da de alta el acta y trabaja en ella hasta tener preparado el borrador.',
        result: 'El acta permanece en Pendiente de realizar hasta que generas el correo de borrador.',
      },
      {
        title: 'Enviar borrador',
        action: 'Pulsa “Generar Outlook”. Se abre el correo bilingüe de borrador para sindicatos y Dirección.',
        check: 'TrAccion cambia automáticamente el estado a Pendiente de alegaciones y fija una fecha límite de 21 días desde la fecha de generación.',
        result: 'Comienza el periodo de alegaciones sin tener que cambiar el estado manualmente.',
      },
      {
        title: 'Alegaciones',
        action: 'Registra las alegaciones recibidas y consulta la fecha límite. Puedes volver a generar el correo de alegaciones o la cita de fin de plazo si lo necesitas.',
        result: 'Al terminar el plazo, pasa el acta a Pendiente de firma.',
      },
      {
        title: 'Firma y cierre',
        action: 'Prepara el acta definitiva y usa “Exportar Outlook” para remitirla para firma.',
        result: 'Cuando el acta esté firmada, adjunta la ruta definitiva y cierra el acta.',
      },
    ],
  },
  {
    title: 'Correo del borrador',
    items: [
      'La acción “Generar Outlook” está disponible mientras el acta está en “Pendiente de realizar” y ya ha sido guardada.',
      'El asunto se genera como “Akta Zirriborroa/Borrador Acta - {nombre del acta}”.',
      'El cuerpo se crea en dos columnas, euskera y castellano, con el nombre del acta y la fecha de sesión.',
      'La fecha tope para recibir aportaciones se calcula como fecha del sistema + 21 días.',
      'Al abrir correctamente el borrador de Outlook, TrAccion guarda automáticamente el cambio a “Pendiente de alegaciones” con esa fecha límite.',
      'Los destinatarios quedan para completar manualmente y Outlook no envía el mensaje de forma automática.',
    ],
  },
  {
    title: 'Pendiente de alegaciones',
    items: [
      'La fecha límite corresponde al plazo de alegaciones iniciado al generar el correo de borrador.',
      'Cada acta puede registrar varias alegaciones por sindicato, con presentada/no presentada, fecha y observación.',
      'Se mantiene disponible el borrador Outlook configurable para comunicaciones durante esta fase y la cita de calendario “FIN ALEGACIONES {título}”.',
      'Al terminar el plazo, usa la transición a “Pendiente de firma”. Esta fase no genera un nuevo plazo automático.',
    ],
  },
  {
    title: 'Correo del acta definitiva',
    items: [
      'En “Pendiente de firma” aparece “Exportar Outlook” para generar el correo bilingüe del acta definitiva.',
      'El asunto se genera como “Behin betiko Akta/Acta Definitiva Acta - {nombre del acta}”.',
      'La fase de firma no tiene una fecha límite automática: se mantiene abierta hasta que la firma esté completada.',
      'Cuando el documento esté firmado, vincula su ruta y usa “Cerrar acta”.',
    ],
  },
  {
    title: 'Histórico y compatibilidad',
    items: [
      'Las actas cerradas quedan protegidas en modo consulta dentro del histórico.',
      'Si necesitas corregir una cerrada, “Reabrir acta” la devuelve a Pendiente de firma.',
      'Las actas antiguas almacenadas como “Borrador” o “Enviada a Dirección” se normalizan automáticamente a “Pendiente de alegaciones”.',
      'Los tipos de acta se pueden ampliar, desactivar o reactivar sin perder las actas ya existentes.',
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
  if (state === 'Pendiente de alegaciones') {
    return addDaysToIsoDate(changedAt, 21);
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
