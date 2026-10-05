import { describe, expect, it } from 'vitest';
import {
  defaultDeadlineForZone,
  defaultMailEnabledForZone,
  renderHuelgaMailTemplate,
} from './huelgasMailTemplates';
import type { HuelgaZona } from './huelgasZones';
import type { HuelgaPuestoAsignacion } from './huelgasAssignments';
import type { HuelgaPersonalTurno } from './huelgasPersonalImport';

const now = '2026-10-05T10:00:00.000Z';

const zona: HuelgaZona = {
  id: 'z-ariz',
  nombre: 'MM Ariz',
  responsableNombre: 'Responsable <Ariz>',
  responsableEmail: 'ariz@example.com',
  correoActivo: true,
  correoAsunto: 'Huelga {{FECHA_HUELGA}} - {{ZONA}} - {{RESPONSABLE}}',
  correoCuerpoHtml: '<p>{{AREAS}}</p><p>{{PUESTOS}}</p>{{COLECTIVOS}}<p>{{TOTAL_PERSONAS}}</p><p>{{INSTRUCCIONES_ESPECIFICAS}}</p>',
  correoPlazos: 'Antes de las 9:45',
  correoInstruccionesHabituales: '',
  active: true,
  createdAt: now,
  updatedAt: now,
};

function asignacion(area: string, puesto: string, residencia: string): HuelgaPuestoAsignacion {
  return {
    residencia,
    puesto,
    area,
    areaId: `area-${area}`,
    zonaId: zona.id,
    zonaNombre: zona.nombre,
    zonaResponsableNombre: zona.responsableNombre,
    zonaResponsableEmail: zona.responsableEmail,
    updatedAt: now,
  };
}

function persona(id: string, puesto: string, residenciaEstacion: string, residenciaAsignacion?: string): HuelgaPersonalTurno {
  return {
    id,
    residenciaEstacion,
    residenciaAsignacion,
    inicio: '',
    salida: '',
    entrada: '',
    fin: '',
    nombreApellidos: `Persona ${id}`,
    puesto,
    turno: 'M',
  };
}

describe('huelgasMailTemplates — caracterización', () => {
  it('mantiene SSCC como única zona sin correo automático por defecto', () => {
    expect(defaultMailEnabledForZone('SSCC')).toBe(false);
    expect(defaultMailEnabledForZone('  sscc ')).toBe(false);
    expect(defaultMailEnabledForZone('MM Ariz')).toBe(true);
  });

  it('mantiene los plazos configurados por zona con normalización de texto', () => {
    expect(defaultDeadlineForZone('MM Ariz')).toContain('9:45');
    expect(defaultDeadlineForZone('  GMO   y Línea ')).toContain('15:00');
    expect(defaultDeadlineForZone('SSCC')).toBe('');
  });

  it('reemplaza marcadores, escapa texto y cuenta personas por área', () => {
    const result = renderHuelgaMailTemplate({
      fecha: '2026-10-05',
      zona,
      asignaciones: [
        asignacion('Taller <A>', 'Mecánico', 'Taller Ariz'),
        asignacion('Operación', 'Supervisor', 'Línea 1'),
      ],
      personal: [
        persona('1', 'Mecánico', 'Taller Ariz'),
        persona('2', 'Mecánico', 'Otra', 'Taller Ariz'),
        persona('3', 'Supervisor', 'Línea 1'),
      ],
      instruccionesEspecificas: 'Revisar <datos>\nSegundo paso',
    });

    expect(result.subject).toBe('Huelga 05/10/2026 - MM Ariz - Responsable &lt;Ariz&gt;');
    expect(result.html).toContain('Taller &lt;A&gt;');
    expect(result.html).toContain('Mecánico');
    expect(result.html).toContain('Taller &lt;A&gt; <strong>(2 personas)</strong>');
    expect(result.html).toContain('Operación <strong>(1 persona)</strong>');
    expect(result.html).toContain('Revisar &lt;datos&gt;<br>Segundo paso');
    expect(result.html).toContain('<p>3</p>');
    expect(result.html).not.toContain('{{');
  });
});
