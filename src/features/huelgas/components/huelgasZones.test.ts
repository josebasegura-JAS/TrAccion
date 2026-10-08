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
    expect(result.every((item) => item.correoActivo && item.active)).toBe(true);
  });

  it('retira una zona legacy SSCC y mantiene únicamente los siete circuitos reales', () => {
    const result = ensureDefaultZonas([
      zona({
        id: 'existing-sscc',
        nombre: '  sscc  ',
        correoActivo: false,
        active: false,
        correoAsunto: '',
        correoCuerpoHtml: '',
      }),
    ]);

    expect(result).toHaveLength(DEFAULT_HUELGA_ZONE_NAMES.length);
    expect(result.some((item) => item.nombre.trim().toLocaleLowerCase('es-ES') === 'sscc')).toBe(false);
    expect(result.every((item) => item.correoAsunto === DEFAULT_HUELGA_MAIL_SUBJECT)).toBe(true);
    expect(result.every((item) => item.correoCuerpoHtml === DEFAULT_HUELGA_MAIL_BODY)).toBe(true);
  });

  it('reactiva un circuito real que hubiera quedado inactivo en configuración legacy', () => {
    const result = ensureDefaultZonas([
      zona({
        id: 'legacy-mm-ariz',
        nombre: 'MM Ariz',
        active: false,
        correoActivo: false,
        responsableNombre: 'Ana',
        responsableEmail: 'ana@example.com',
      }),
    ]);

    const ariz = result.find((item) => item.nombre === 'MM Ariz');
    expect(ariz?.active).toBe(true);
    expect(ariz?.correoActivo).toBe(true);
  });

  it('un circuito completo exige responsable, email, asunto y cuerpo', () => {
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com' }))).toBe(true);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: '' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: '', responsableEmail: 'ana@example.com' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com', correoAsunto: '' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com', correoCuerpoHtml: '' }))).toBe(false);
  });
});
