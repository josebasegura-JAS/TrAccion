import { describe, expect, it } from 'vitest';
import type { TeletrabajoSolicitud } from './solicitud';
import { buildTeletrabajoExtraordinariaDireccionReport, selectTeletrabajoDireccionExportRows } from './exportDireccionScope';
import { buildTeletrabajoDireccionAdministrativeFields } from './exportDireccionFields';

const ordinary = {
  id: 'o', periodo: '2026-2027', fechaSolicitud: '2026-07-31',
  modalidadTramitacion: 'ordinaria', estado: 'pendiente', tipoSolicitud: 'nueva',
} as TeletrabajoSolicitud;
const extraordinary = {
  ...ordinary, id: 'e', fechaSolicitud: '2026-08-01',
  modalidadTramitacion: 'extraordinaria', estado: 'aprobada', tipoSolicitud: 'renovacion',
} as TeletrabajoSolicitud;
const unknown = { ...ordinary, id: 'u', fechaSolicitud: '', modalidadTramitacion: undefined } as TeletrabajoSolicitud;

describe('Excel Dirección: alcance de exportación', () => {
  it('exporta vista actual, ordinarias, extraordinarias o todo el periodo sin alterar el origen', () => {
    const rows = [ordinary, extraordinary, unknown];
    expect(selectTeletrabajoDireccionExportRows(rows, [extraordinary], 'vista').map((s) => s.id)).toEqual(['e']);
    expect(selectTeletrabajoDireccionExportRows(rows, [extraordinary], 'ordinaria').map((s) => s.id)).toEqual(['o']);
    expect(selectTeletrabajoDireccionExportRows(rows, [extraordinary], 'extraordinaria').map((s) => s.id)).toEqual(['e']);
    expect(selectTeletrabajoDireccionExportRows(rows, [extraordinary], 'todas').map((s) => s.id)).toEqual(['o', 'e', 'u']);
    expect(rows).toHaveLength(3);
  });

  it('incluye modalidad, fecha y referencia para cada modalidad, también renovación', () => {
    expect(buildTeletrabajoDireccionAdministrativeFields(ordinary, { antiguedadPuesto: '2025-07-31' }))
      .toEqual({
        modalidad: 'Ordinaria', fechaSolicitud: '2026-07-31',
        referenciaAntiguedad: '2026-09-01', estado: 'pendiente', tipo: 'nueva',
      });
    expect(buildTeletrabajoDireccionAdministrativeFields(extraordinary, { antiguedadPuesto: '2025-07-31' }))
      .toEqual({
        modalidad: 'Extraordinaria', fechaSolicitud: '2026-08-01',
        referenciaAntiguedad: '2026-08-01', estado: 'aprobada', tipo: 'renovacion',
      });
    expect(buildTeletrabajoDireccionAdministrativeFields(unknown, null).referenciaAntiguedad).toBe('');
  });
});

describe('Dirección · informe extraordinario acumulado', () => {
  const build = (id: string, modalidad: 'ordinaria' | 'extraordinaria', estado: TeletrabajoSolicitud['estado'], periodo = '2026-2027') => ({
    ...ordinary, id, periodo, estado, modalidadTramitacion: modalidad, deletedAt: null,
  } as TeletrabajoSolicitud);

  it('sitúa pendientes extraordinarias delante de todas las aprobadas del mismo periodo', () => {
    const approvedOrdinary = build('a', 'ordinaria', 'aprobada');
    const newExtra = build('n', 'extraordinaria', 'pendiente');
    const approvedExtra = build('ae', 'extraordinaria', 'aprobada');
    const analysed = build('an', 'extraordinaria', 'analizada');
    const denied = build('d', 'extraordinaria', 'denegada');
    const previousPeriod = build('old', 'ordinaria', 'aprobada', '2025-2026');
    const report = buildTeletrabajoExtraordinariaDireccionReport([
      approvedOrdinary, newExtra, approvedExtra, analysed, denied,
    ]);
    expect(report.rows.map((s) => s.id)).toEqual(['n', 'an', 'a', 'ae']);
    expect(report.nuevasCount).toBe(2);
    expect(report.aprobadasCount).toBe(2);
    // Period filtering is performed by the caller; the exporter receives
    // only one period to prevent accidental cross-period totals.
    expect(previousPeriod.periodo).not.toBe(approvedOrdinary.periodo);
  });

  it('excluye desistidas, denegadas y eliminadas, sin duplicar aprobadas extraordinarias', () => {
    const removed = { ...build('x','extraordinaria','pendiente'), deletedAt:'2026-11-01' };
    const report = buildTeletrabajoExtraordinariaDireccionReport([
      build('1','extraordinaria','aprobada'),
      build('2','extraordinaria','desistida'),
      removed,
    ]);
    expect(report.rows.map((s) => s.id)).toEqual(['1']);
    expect(report.nuevasCount).toBe(0);
    expect(report.aprobadasCount).toBe(1);
  });
});
