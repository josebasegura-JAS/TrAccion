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
    correoActivo: true,
    correoAsunto: '',
    correoCuerpoHtml: '',
    correoPlazos: '',
    correoInstruccionesHabituales: '',
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('huelgasZones — caracterización', () => {
  it('crea exactamente las zonas por defecto y deja SSCC sin correo automático', () => {
    const result = ensureDefaultZonas([]);

    expect(result).toHaveLength(DEFAULT_HUELGA_ZONE_NAMES.length);
    expect(result.map((item) => item.nombre).sort()).toEqual([...DEFAULT_HUELGA_ZONE_NAMES].sort());
    expect(result.find((item) => item.nombre === 'SSCC')?.correoActivo).toBe(false);
    expect(result.filter((item) => item.nombre !== 'SSCC').every((item) => item.correoActivo)).toBe(true);
  });

  it('no duplica una zona existente aunque cambien mayúsculas o espacios y rellena campos de correo legacy', () => {
    const result = ensureDefaultZonas([
      zona({
        id: 'existing-sscc',
        nombre: '  sscc  ',
        correoActivo: undefined as unknown as boolean,
        correoAsunto: '',
        correoCuerpoHtml: '',
      }),
    ]);

    const sscc = result.filter((item) => item.nombre.trim().toLocaleLowerCase('es-ES') === 'sscc');
    expect(sscc).toHaveLength(1);
    expect(sscc[0]).toMatchObject({
      id: 'existing-sscc',
      correoActivo: false,
      correoAsunto: DEFAULT_HUELGA_MAIL_SUBJECT,
      correoCuerpoHtml: DEFAULT_HUELGA_MAIL_BODY,
    });
  });

  it('una zona inactiva nunca está completa', () => {
    expect(isZonaCompleta(zona({ active: false, correoActivo: false }))).toBe(false);
  });

  it('una zona activa con correo desactivado no exige responsable', () => {
    expect(isZonaCompleta(zona({ correoActivo: false, responsableNombre: '', responsableEmail: '' }))).toBe(true);
  });

  it('una zona activa con correo exige nombre y email del responsable', () => {
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: 'ana@example.com' }))).toBe(true);
    expect(isZonaCompleta(zona({ responsableNombre: 'Ana', responsableEmail: '' }))).toBe(false);
    expect(isZonaCompleta(zona({ responsableNombre: '', responsableEmail: 'ana@example.com' }))).toBe(false);
  });
});
