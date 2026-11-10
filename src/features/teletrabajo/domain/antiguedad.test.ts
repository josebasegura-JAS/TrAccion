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

  it('mantiene el corte del 1 de septiembre para las ordinarias hasta el 31 de julio', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-07-31' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-09-01');
  });

  it('usa fecha real desde el 1 de agosto, incluso si no ha llegado septiembre', () => {
    const result = evaluateTeletrabajoAntiguedad(
      solicitud({ fechaSolicitud: '2026-08-01' }),
      { antiguedadPuesto: '2025-07-31' },
    );
    expect(result.status).toBe('cumple');
    expect(result.fechaReferencia).toBe('2026-08-01');
    const noCumple = evaluateTeletrabajoAntiguedad(
      solicitud({ fechaSolicitud: '2026-08-25' }),
      { antiguedadPuesto: '2025-09-01' },
    );
    expect(noCumple.status).toBe('no-cumple');
    expect(noCumple.fechaReferencia).toBe('2026-08-25');
  });

  it('una nueva solicitud posterior al 1 de septiembre pero anterior al aniversario no cumple', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-10-20' }), empleado);
    expect(result.status).toBe('no-cumple');
    expect(result.fechaReferencia).toBe('2026-10-20');
  });

  it('las renovaciones extraordinarias usan fecha de presentación; ordinarias mantienen septiembre', () => {
    const late = evaluateTeletrabajoAntiguedad(solicitud({ tipoSolicitud: 'renovacion' }), empleado);
    expect(late.status).toBe('cumple');
    expect(late.fechaReferencia).toBe('2026-11-05');
    const ordinary = evaluateTeletrabajoAntiguedad(solicitud({
      tipoSolicitud: 'renovacion',
      fechaSolicitud: '2026-07-15',
    }), empleado);
    expect(ordinary.status).toBe('no-cumple');
    expect(ordinary.fechaReferencia).toBe('2026-09-01');
  });

  it('con fecha de solicitud inválida no supone antigüedad cumplida', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '2026-13-45' }), empleado);
    expect(result.status).toBe('sin-dato');
    expect(result.fechaReferencia).toBe('');
  });

  it('sin fecha legacy no inventa cumplimiento del año', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({ fechaSolicitud: '' }), empleado);
    expect(result.status).toBe('sin-dato');
    expect(result.fechaReferencia).toBe('');
  });

  it('respeta la modalidad persistida y no reinterpreta ordinarias históricas', () => {
    const result = evaluateTeletrabajoAntiguedad(solicitud({
      fechaSolicitud: '2026-07-31',
      modalidadTramitacion: 'ordinaria',
    }), empleado);
    expect(result.fechaReferencia).toBe('2026-09-01');
  });
});
