export type EspecialRecipientType = 'para' | 'cc';

export interface EspecialEvent {
  id: string;
  evento: string;
  fecha: string;
  hora: string;
  enlace: string;
  ruta: string;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface EspecialEventDraft {
  evento: string;
  fecha: string;
  hora: string;
  enlace: string;
  ruta: string;
  observaciones: string;
}

export interface EspecialRecipient {
  id: string;
  nombre: string;
  email: string;
  tipo: EspecialRecipientType;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface EspecialRecipientDraft {
  nombre: string;
  email: string;
  tipo: EspecialRecipientType;
}

export interface EspecialRecipientsByType {
  para: EspecialRecipient[];
  cc: EspecialRecipient[];
}

export interface EspecialMailDraft {
  subject: string;
  html: string;
  to: string[];
  cc: string[];
}

export const EMPTY_ESPECIAL_EVENT_DRAFT: EspecialEventDraft = {
  evento: '',
  fecha: '',
  hora: '',
  enlace: '',
  ruta: '',
  observaciones: '',
};

export const EMPTY_ESPECIAL_RECIPIENT_DRAFT: EspecialRecipientDraft = {
  nombre: '',
  email: '',
  tipo: 'para',
};

export function buildEspecialSubject(evento: string): string {
  return `Servicio Especial ${evento.trim()}`.trimEnd();
}

export function buildEspecialEvent(
  draft: EspecialEventDraft,
  now: string,
  id: string,
  previous?: EspecialEvent,
): EspecialEvent {
  return {
    id,
    evento: draft.evento.trim(),
    fecha: draft.fecha.trim(),
    hora: draft.hora.trim(),
    enlace: draft.enlace.trim(),
    ruta: draft.ruta.trim(),
    observaciones: draft.observaciones.trim(),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function buildEspecialRecipient(
  draft: EspecialRecipientDraft,
  now: string,
  id: string,
  previous?: EspecialRecipient,
): EspecialRecipient {
  return {
    id,
    nombre: draft.nombre.trim(),
    email: draft.email.trim(),
    tipo: draft.tipo,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    deletedAt: previous?.deletedAt ?? null,
  };
}

export function visibleEspecialEvents(events: EspecialEvent[]): EspecialEvent[] {
  return events.filter((event) => !event.deletedAt);
}

export function visibleEspecialRecipients(recipients: EspecialRecipient[]): EspecialRecipient[] {
  return recipients.filter((recipient) => !recipient.deletedAt);
}

export function splitEspecialRecipients(recipients: EspecialRecipient[]): EspecialRecipientsByType {
  return visibleEspecialRecipients(recipients).reduce<EspecialRecipientsByType>(
    (groups, recipient) => ({
      ...groups,
      [recipient.tipo]: [...groups[recipient.tipo], recipient],
    }),
    { para: [], cc: [] },
  );
}

export function buildEspecialHtml(event: EspecialEventDraft): string {
  const rows = [
    ['Evento', event.evento.trim()],
    ['Fecha', event.fecha.trim()],
    ['Hora', event.hora.trim()],
    ['Enlace', event.enlace.trim()],
    ['Ruta', event.ruta.trim()],
    ['Observaciones', event.observaciones.trim()],
  ].filter(([, value]) => value.length > 0);

  const bullets = rows
    .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
    .join('');

  return [
    '<div style="font-family: Verdana, Geneva, sans-serif; font-size: 10pt; color: #000000;">',
    '<p>Buenos días,</p>',
    '<p>Se informa del siguiente servicio especial:</p>',
    `<ul>${bullets}</ul>`,
    '<p>Un saludo.</p>',
    '</div>',
  ].join('');
}

export function buildEspecialMailDraft(
  event: EspecialEventDraft,
  recipients: EspecialRecipient[],
): EspecialMailDraft {
  const groups = splitEspecialRecipients(recipients);

  return {
    subject: buildEspecialSubject(event.evento),
    html: buildEspecialHtml(event),
    to: groups.para.map((recipient) => recipient.email),
    cc: groups.cc.map((recipient) => recipient.email),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
