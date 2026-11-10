import { describe, expect, it } from 'vitest';
import type { TeletrabajoSolicitud } from './solicitud';
import {
  buildTeletrabajoOrdinaryClosure,
  filterSolicitudesByTeletrabajoModalidad,
  getTeletrabajoClosureId,
  parseTeletrabajoClosure,
} from './cierreOrdinario';

const rows = [
  { id: 'ord', periodo: '2026-2027', fechaSolicitud: '2026-07-31', estado: 'pendiente', deletedAt: null },
  { id: 'ext', periodo: '2026-2027', fechaSolicitud: '2026-08-01', estado: 'aprobada', deletedAt: null },
  { id: 'unknown', periodo: '2026-2027', fechaSolicitud: '', estado: 'pendiente', deletedAt: null },
  { id: 'deleted', periodo: '2026-2027', fechaSolicitud: '2026-07-20', estado: 'denegada', deletedAt: '2026-08-15' },
  { id: 'previous', periodo: '2025-2026', fechaSolicitud: '2025-07-20', estado: 'aprobada', deletedAt: null },
] as TeletrabajoSolicitud[];

describe('Fotografía de cierre ordinario', () => {
  it('crea un registro distinto y estable para cada periodo', () => {
    expect(getTeletrabajoClosureId('2026-2027')).toBe('__teletrabajo_ordinary_closure_v1__:2026-2027');
    expect(getTeletrabajoClosureId('2025-2026')).not.toBe(getTeletrabajoClosureId('2026-2027'));
  });

  it('congela solo los expedientes ordinarios, su estado en captura y el número de sin clasificar', () => {
    const snap = buildTeletrabajoOrdinaryClosure('2026-2027', rows, new Date('2026-11-10T08:00:00.000Z'));
    expect(snap.deadline).toBe('2026-07-31');
    expect(snap.capturedAt).toBe('2026-11-10T08:00:00.000Z');
    expect(snap.entries).toEqual([{ id: 'ord', estado: 'pendiente', fechaSolicitud: '2026-07-31' }]);
    expect(snap.unclassifiedCount).toBe(1);
    expect(parseTeletrabajoClosure(JSON.stringify(snap))).toEqual(snap);
  });

  it('nunca registra cierre anticipado', () => {
    expect(() => buildTeletrabajoOrdinaryClosure('2026-2027', rows, new Date('2026-07-31T16:00:00')))
      .toThrow('no ha alcanzado');
  });

  it('rechaza metadatos inválidos', () => {
    expect(parseTeletrabajoClosure('{}')).toBeNull();
    expect(parseTeletrabajoClosure('{invalid')).toBeNull();
  });

  it('mantiene las vistas separadas sin afectar a las solicitudes fuente', () => {
    expect(filterSolicitudesByTeletrabajoModalidad(rows, 'ordinaria').map((s) => s.id))
      .toEqual(['ord', 'deleted', 'previous']);
    expect(filterSolicitudesByTeletrabajoModalidad(rows, 'extraordinaria').map((s) => s.id)).toEqual(['ext']);
    expect(filterSolicitudesByTeletrabajoModalidad(rows, 'sin_clasificar').map((s) => s.id)).toEqual(['unknown']);
    expect(rows[0].estado).toBe('pendiente');
  });
});
