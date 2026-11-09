import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import type { TeletrabajoSolicitud } from './solicitud';
import { evaluateTeletrabajoAntiguedad } from './antiguedad';

const empleado = { antiguedadPuesto: '2025-11-01' } as Employee;
function solicitud(overrides: Partial<TeletrabajoSolicitud> = {}): TeletrabajoSolicitud {
  return {
    empleado: '100',
    periodo: '2026-2027',
    tipoSolicitud: 'nueva',
    fechaSolicitud: '2026-11-05',
    ...overrides,
  } as TeletrabajoSolicitud;
}

describe('antigüedad teletrabajo: solicitudes fuera del inicio ordinario', () => {
  it('admite nueva solicitud del 5 de noviembre si cumple el año el 1 de noviembre', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud(), empleado);
    expect(result.status).toBe('cumple');
    expect(result.fechaReferencia).toBe('2026-11-05');
    expect(result.title).toContain('Referencia: 2026-11-05');
  });

  it('mantiene el corte del 1 de septiembre en la campaña ordinaria', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-08-25' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-09-01');
  });

  it('una nueva solicitud posterior al 1 de septiembre pero anterior al aniversario no cumple', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-10-20' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-10-20');
  });

  it('las renovaciones siguen tomando el inicio ordinario del periodo', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ tipoSolicitud: 'renovacion' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-09-01');
  });

  it('con fecha de solicitud inválida no supone antigüedad cumplida', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-13-45' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-09-01');
  });
});
