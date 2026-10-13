export type ActividadExternaEstado = 'pendiente' | 'autorizada' | 'denegada';
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
      && (item.estado === 'pendiente' || item.estado === 'autorizada' || item.estado === 'denegada');
  });
}

export function escapeMailHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function buildActividadMail(record: ActividadExterna) {
  const name = escapeMailHtml(record.nombre);
  const activity = escapeMailHtml(record.actividad).replace(/\n/g, '<br>');
  const approved = record.estado === 'autorizada';
  const subject = approved ? 'Resolución favorable de compatibilidad para actividad externa' : 'Resolución de solicitud de compatibilidad para actividad externa';
  const resolution = approved
    ? 'Te comunicamos que se ha autorizado la solicitud de compatibilidad para la actividad externa indicada.'
    : 'Te comunicamos que no se ha autorizado la solicitud de compatibilidad para la actividad externa indicada.';
  const observations = record.observacionesResolucion ?? record.motivoDenegacion ?? '';
  const reason = observations.trim()
    ? `<p><strong>${approved ? 'Observaciones' : 'Motivo'}:</strong> ${escapeMailHtml(observations).replace(/\n/g, '<br>')}</p>` : '';
  return { subject, html: `<p>Hola, ${name}:</p><p>${resolution}</p><p><strong>Actividad:</strong> ${activity}</p>${reason}<p>Un saludo,<br>Relaciones Laborales<br>Metro Bilbao</p>` };
}
