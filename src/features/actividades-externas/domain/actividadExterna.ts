export type ActividadExternaEstado = 'pendiente' | 'propuesta' | 'rechazada_rrll' | 'autorizada' | 'denegada';
export type ActividadExternaComunicacion = 'pendiente' | 'borrador' | 'confirmada';

export interface ActividadExterna {
  id: string;
  empleado: string;
  nombre: string;
  email: string;
  actividad: string;
  fechaSolicitud: string;
  remunerada: boolean;
  estado: ActividadExternaEstado;
  motivoDenegacion: string;
  observacionesResolucion?: string;
  fechaResolucion: string | null;
  fechaRevisionRrll?: string | null;
  observacionesRrll?: string;
  comunicacion: ActividadExternaComunicacion;
  fechaComunicacion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActividadExternaDraft {
  empleado: string;
  nombre: string;
  email: string;
  actividad: string;
  fechaSolicitud: string;
  remunerada: boolean;
}

export function parseActividadesExternas(raw: string | null): ActividadExterna[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is ActividadExterna => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<ActividadExterna>;
    return typeof item.id === 'string' && typeof item.empleado === 'string'
      && typeof item.actividad === 'string' && typeof item.updatedAt === 'string'
      && (['pendiente', 'propuesta', 'rechazada_rrll', 'autorizada', 'denegada'] as string[]).includes(item.estado ?? '');
  });
}

export function escapeMailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildActividadMail(record: ActividadExterna, puestoTrabajo?: string) {
  const name = escapeMailHtml(record.nombre);
  if (record.estado === 'autorizada') {
    const puesto = escapeMailHtml(puestoTrabajo?.trim() || '[PUESTO DE TRABAJO]');
    return {
      subject: 'Resolución favorable de solicitud de actividad externa',
      html: `<div style="font-family:Verdana, Geneva, sans-serif;font-size:10pt;font-weight:normal;"><p>Kaixo ${escapeMailHtml(record.nombre.trim().split(/\\s+/)[0] || '')},</p><p>Atendiendo a las explicaciones de las actividades concretas que nos ha hecho llegar, te comunicamos que una vez revisada tu solicitud no existe incompatibilidad con tu puesto de ${puesto}.</p><p>Cualquier aclaración estamos a tu disposición.</p><p>Ondo izan</p></div>`,
    };
  }
  const activity = escapeMailHtml(record.actividad).replace(/\\n/g, '<br>');
  const subject = 'Resolución de solicitud de compatibilidad para actividad externa';
  const observations = record.observacionesResolucion ?? record.motivoDenegacion ?? '';
  const reason = observations.trim()
    ? `<p><strong>Motivo:</strong> ${escapeMailHtml(observations).replace(/\\n/g, '<br>')}</p>` : '';
  return { subject, html: `<p>Hola, ${name}:</p><p>Te comunicamos que no se ha autorizado la solicitud de compatibilidad para la actividad externa indicada.</p><p><strong>Actividad:</strong> ${activity}</p>${reason}<p>Un saludo,<br>Relaciones Laborales<br>Metro Bilbao</p>` };
}
