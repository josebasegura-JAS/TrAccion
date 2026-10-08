import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HUELGA_ZONE_NAMES,
  ensureDefaultZonas,
  isZonaCompleta,
  type HuelgaZona,
} from './huelgasZones';
import {
  DEFAULT_HUELGA_MAIL_BODY,
  DEFAULT_HUELGA_MAIL_SUBJECT,
} from './huelgasMailTemplates';

const now = '2026-10-05T10:00:00.000Z';

function zona(overrides: Partial<HuelgaZona>): HuelgaZona {
  return {
    id: 'z-1',
    nombre: 'MM Ariz',
    responsableNombre: '',
    responsableEmail: '',
    correoCc: 'RELACIONES_LABORALES@metrobilbao.eus',
    correoActivo: true,
    correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT,
    correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY,
    correoPlazos: '',
    correoInstruccionesHabituales: '',
    plantillaExcelUrl: 'huelgas-templates/mm-ariz.xlsx',
    plantillaExcelNombrePatron: 'MM Ariz - Seguimiento huelga {{FECHA_HUELGA_ARCHIVO}}.xlsx',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('huelgasZones — caracterización', () => {
  it('crea exactamente los siete circuitos reales y todos quedan preparados para correo', () => {
    const result = ensureDefaultZonas([]);

    expect(result).toHaveLength(DEFAULT_HUELGA_ZONE_NAMES.length);
    expect(result.map((item) => item.nombre).sort()).toEqual([...DEFAULT_HUELGA_ZONE_NAMES].sort());
    expect(result.some((item) => item.nombre === 'SSCC')).toBe(false);
    expect(result.every((item) => item.correoActivo)).toBe(true);
  });

  it('retira una zona legacy SSCC y mantiene únicamente los siete circuitos reales', () => {
    const result = ensureDefaultZonas([
      zona({
        id: 'existing-sscc',
        nombre: '  sscc  ',
        correoActivo: undefined as unknown as boolean,
        correoAsunto: '',
        correoCuerpoHtml: '',
      }),
    ]);

    expect(result).toHaveLength(DEFAULT_HUELGA_ZONE_NAMES.length);
    expect(result.some((item) => item.nombre.trim().toLocaleLowerCase('es-ES') === 'sscc')).toBe(false);
    expect(result.every((item) => item.correoAsunto === DEFAULT_HUELGA_MAIL_SUBJECT)).toBe(true);
    expect(result.every((item) => item.correoCuerpoHtml === DEFAULT_HUELGA_MAIL_BODY)).toBe(true);
  });

  it('una zona inactiva nunca está completa', () => {
    expect(isZonaCompleta(zona({ active: false, correoActivo: false }))).toBe(false);
  });

  it('una zona activa con correo desactivado no exige responsable', () => {
    expect(isZonaCompleta(zona({ correoActivo: false, responsableNombre: '', responsableEmail: '' }))).toBe(true);
  });

  it('una zona activa con correo exige responsable, email y plantilla Excel', () => {
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com' }))).toBe(true);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: '' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: '', responsableEmail: 'ana@example.com' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com', plantillaExcelUrl: '' }))).toBe(false);
  });
});
