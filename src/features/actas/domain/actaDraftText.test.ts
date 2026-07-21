import { describe, expect, it } from 'vitest';
import type { Acta } from './acta';
import { buildEmptyActaContenido } from './actaContenido';
import { buildActaDraftText } from './actaDraftText';

describe('buildActaDraftText', () => {
  it('genera un borrador legible con asistentes y puntos', () => {
    const acta = {
      id: 'a1',
      tipo: 'Comité',
      titulo: 'Comité de Empresa',
      fechaSesion: '2026-05-21',
    } as Acta;
    const contenido = buildEmptyActaContenido('a1', '2026-05-21T00:00:00.000Z');
    contenido.lugar = 'Sede central';
    contenido.horaInicio = '09:30';
    contenido.horaFin = '12:00';
    contenido.asistencia = [
      {
        id: 'as1',
        censoMiembroId: 'c1',
        nombre: 'Persona Uno',
        organizacion: 'LAB',
        grupo: 'Representación Sindical',
        estado: 'presente',
        suplenteDeId: null,
        horaEntrada: '',
        horaSalida: '',
      },
    ];
    contenido.puntos = [
      {
        id: 'p1',
        orden: 1,
        taskId: null,
        titulo: 'Teletrabajo',
        contenido: '<p>La RD expone la propuesta.</p>',
        resultado: 'acuerdo',
      },
    ];

    const result = buildActaDraftText(acta, contenido);
    expect(result).toContain('Persona Uno (LAB)');
    expect(result).toContain('1. Teletrabajo');
    expect(result).toContain('La RD expone la propuesta.');
    expect(result).toContain('Se alcanza acuerdo');
  });
});
