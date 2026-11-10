import { describe, expect, it } from 'vitest';
import type { TeletrabajoSolicitud } from './solicitud';
import { selectTeletrabajoDireccionExportRows } from './exportDireccionScope';
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
