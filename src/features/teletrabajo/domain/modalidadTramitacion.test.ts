import { describe, expect, it } from 'vitest';
import {
  classifyTeletrabajoSolicitud,
  getTeletrabajoModalidad,
  getTeletrabajoOrdinaryDeadline,
  isTeletrabajoOrdinaryAdmissionClosed,
  validateNewTeletrabajoAdmission,
  validateTeletrabajoClassificationChange,
} from './modalidadTramitacion';

const normal = { periodo: '2026-2027', fechaSolicitud: '2026-07-31' };

describe('Teletrabajo: modalidad ordinaria y extraordinaria', () => {
  it('sitúa el límite ordinario en el 31 de julio del primer año del periodo', () => {
    expect(getTeletrabajoOrdinaryDeadline('2026-2027')).toBe('2026-07-31');
    expect(getTeletrabajoOrdinaryDeadline('2026/2027')).toBe('2026-07-31');
    expect(getTeletrabajoOrdinaryDeadline('2026-2028')).toBeNull();
  });

  it('clasifica 31 de julio como ordinaria y desde 1 de agosto como extraordinaria', () => {
    expect(classifyTeletrabajoSolicitud(normal)).toBe('ordinaria');
    expect(classifyTeletrabajoSolicitud({ ...normal, fechaSolicitud: '2026-08-01' })).toBe('extraordinaria');
    expect(classifyTeletrabajoSolicitud({ ...normal, fechaSolicitud: '2026-11-05' })).toBe('extraordinaria');
  });

  it('nunca inventa modalidad a partir de una fecha ausente o imposible', () => {
    expect(classifyTeletrabajoSolicitud({ ...normal, fechaSolicitud: '' })).toBe('sin_clasificar');
    expect(classifyTeletrabajoSolicitud({ ...normal, fechaSolicitud: '2026-02-30' })).toBe('sin_clasificar');
    expect(classifyTeletrabajoSolicitud({ periodo: '', fechaSolicitud: '2026-07-15' })).toBe('sin_clasificar');
  });

  it('cierra la admisión ordinaria a partir del 1 de agosto, no antes', () => {
    expect(isTeletrabajoOrdinaryAdmissionClosed(normal.periodo, new Date('2026-07-31T12:00:00'))).toBe(false);
    expect(isTeletrabajoOrdinaryAdmissionClosed(normal.periodo, new Date('2026-08-01T12:00:00'))).toBe(true);
    expect(isTeletrabajoOrdinaryAdmissionClosed('2027-2028', new Date('2026-11-09T12:00:00'))).toBe(false);
  });

  it('bloquea un alta ordinaria atrasada después del cierre, pero permite extraordinarias', () => {
    const now = new Date('2026-11-09T12:00:00');
    const refused = validateNewTeletrabajoAdmission(normal, now);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.message).toContain('cerró el 2026-07-31');
    expect(validateNewTeletrabajoAdmission({ ...normal, fechaSolicitud: '2026-08-01' }, now))
      .toEqual({ ok: true, modalidad: 'extraordinaria' });
  });

  it('admite expedientes ordinarios futuros y evita fechas inválidas', () => {
    expect(validateNewTeletrabajoAdmission({ periodo: '2027-2028', fechaSolicitud: '2027-07-31' }, new Date('2026-11-09T12:00:00')))
      .toEqual({ ok: true, modalidad: 'ordinaria' });
    expect(validateNewTeletrabajoAdmission({ ...normal, fechaSolicitud: '2026-13-40' }, new Date('2026-07-31T12:00:00')).ok).toBe(false);
  });

  it('conserva la modalidad persistida incluso si hay datos legacy incoherentes', () => {
    expect(getTeletrabajoModalidad({ ...normal, modalidadTramitacion: 'extraordinaria' })).toBe('extraordinaria');
    expect(getTeletrabajoModalidad({ ...normal, fechaSolicitud: '' })).toBe('sin_clasificar');
  });

  it('no permite convertir ordinaria en extraordinaria por edición de fecha', () => {
    const result = validateTeletrabajoClassificationChange(
      { ...normal, modalidadTramitacion: 'ordinaria' },
      { ...normal, fechaSolicitud: '2026-11-09' },
    );
    expect(result.ok).toBe(false);
  });

  it('permite completar fechas antiguas sin clasificar y tramitar expedientes ordinarios existentes', () => {
    expect(validateTeletrabajoClassificationChange(
      { ...normal, fechaSolicitud: '' },
      normal,
    )).toEqual({ ok: true, modalidad: 'ordinaria' });
    expect(validateTeletrabajoClassificationChange(
      { ...normal, modalidadTramitacion: 'ordinaria' },
      { ...normal, fechaSolicitud: '2026-07-25' },
    )).toEqual({ ok: true, modalidad: 'ordinaria' });
  });
});
