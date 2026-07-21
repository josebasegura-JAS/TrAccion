import type { Acta } from './acta';
import type { ActaContenido, ActaPuntoResultado, VotacionPosicion } from './actaContenido';

const RESULTADO_TEXT: Record<ActaPuntoResultado, string> = {
  sin_resolver: 'Pendiente de concretar',
  acuerdo: 'Se alcanza acuerdo',
  sin_acuerdo: 'No se alcanza acuerdo',
  pendiente_votacion: 'Queda pendiente de votación',
};

const VOTO_TEXT: Record<VotacionPosicion, string> = {
  favor: 'a favor',
  contra: 'en contra',
  abstencion: 'abstención',
  pendiente: 'pendiente',
  no_participa: 'no participa',
};

function htmlToText(html: string): string {
  return html
    .replace(/<\/?(p|div|li|ul|ol|br)[^>]*>/gi, (tag) =>
      tag.toLowerCase().startsWith('</') || /<br/i.test(tag) ? '\n' : '',
    )
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

export function buildActaDraftText(acta: Acta, contenido: ActaContenido): string {
  const lines: string[] = [];
  lines.push((acta.titulo || `Acta de ${acta.tipo}`).toUpperCase());
  lines.push('');
  lines.push(`Fecha: ${acta.fechaSesion || 'PENDIENTE'}`);
  lines.push(`Lugar: ${contenido.lugar || 'PENDIENTE'}`);
  lines.push(
    `Horario: ${contenido.horaInicio || 'PENDIENTE'} - ${contenido.horaFin || 'PENDIENTE'}`,
  );

  const presentes = contenido.asistencia.filter((entry) => entry.estado !== 'ausente');
  const ausentes = contenido.asistencia.filter((entry) => entry.estado === 'ausente');
  for (const grupo of ['Dirección', 'Representación Sindical', 'Invitado'] as const) {
    const grupoPresentes = presentes.filter((entry) => entry.grupo === grupo);
    if (grupoPresentes.length) {
      lines.push('');
      lines.push(
        `${grupo}: ${joinNames(grupoPresentes.map((entry) => `${entry.nombre}${entry.organizacion ? ` (${entry.organizacion})` : ''}`))}.`,
      );
    }
  }
  if (ausentes.length) {
    lines.push(`Excusan su asistencia: ${joinNames(ausentes.map((entry) => entry.nombre))}.`);
  }

  if (contenido.recesos.length) {
    lines.push('');
    for (const receso of contenido.recesos) {
      lines.push(
        `Se realiza un receso entre las ${receso.horaInicio || 'PENDIENTE'} y las ${receso.horaFin || 'PENDIENTE'} horas.`,
      );
    }
  }

  lines.push('');
  lines.push('ORDEN DEL DÍA');
  contenido.puntos.forEach((punto, index) => lines.push(`${index + 1}. ${punto.titulo}`));

  lines.push('');
  lines.push('DESARROLLO DE LA SESIÓN');
  contenido.puntos.forEach((punto, index) => {
    lines.push('');
    lines.push(`${index + 1}. ${punto.titulo}`);
    const body = htmlToText(punto.contenido);
    lines.push(body || '[Pendiente de redactar]');
    lines.push(`Resultado: ${RESULTADO_TEXT[punto.resultado]}.`);

    const acuerdos = contenido.acuerdos.filter((acuerdo) => acuerdo.puntoId === punto.id);
    acuerdos.forEach((acuerdo) => {
      const responsable = acuerdo.responsable ? ` Responsable: ${acuerdo.responsable}.` : '';
      const fecha = acuerdo.fechaLimite ? ` Fecha límite: ${acuerdo.fechaLimite}.` : '';
      lines.push(
        `Acuerdo/compromiso: ${acuerdo.descripcion || '[Pendiente]'}.${responsable}${fecha}`,
      );
    });

    const votaciones = contenido.votaciones.filter((votacion) => votacion.puntoId === punto.id);
    votaciones.forEach((votacion) => {
      lines.push(`Votación: ${votacion.tema}.`);
      votacion.posiciones.forEach((posicion) => {
        const detalle = posicion.observacion ? ` (${posicion.observacion})` : '';
        lines.push(`- ${posicion.organizacion}: ${VOTO_TEXT[posicion.posicion]}${detalle}.`);
      });
    });
  });

  lines.push('');
  lines.push(
    `Sin más asuntos que tratar, finaliza la sesión a las ${contenido.horaFin || 'PENDIENTE'} horas.`,
  );
  return lines.join('\n');
}
