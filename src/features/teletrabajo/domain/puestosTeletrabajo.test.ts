import { describe, expect, it } from 'vitest';
import {
  normalizeTeletrabajoPuesto,
  normalizeTeletrabajoPuestoDraft,
  rowsToTeletrabajoPuestoDrafts,
} from './puestosTeletrabajo';

describe('normalizeTeletrabajoPuesto', () => {
  it('quita acentos, colapsa espacios y pasa a minúsculas', () => {
    expect(normalizeTeletrabajoPuesto('  Técnico/a   RRLL ')).toBe('tecnico/a rrll');
  });

  it('devuelve cadena vacía para valores nulos o indefinidos', () => {
    expect(normalizeTeletrabajoPuesto(null)).toBe('');
    expect(normalizeTeletrabajoPuesto(undefined)).toBe('');
  });
});

describe('normalizeTeletrabajoPuestoDraft', () => {
  it('recorta textos y normaliza números a enteros no negativos', () => {
    expect(
      normalizeTeletrabajoPuestoDraft({
        puesto: '  Administrativo/a  ',
        maxSolicitudes: 2.9,
        dotacionComputable: -3,
        observaciones: '  Nota  ',
      }),
    ).toEqual({
      puesto: 'Administrativo/a',
      maxSolicitudes: 2,
      dotacionComputable: 0,
      grupoCoberturaId: null,
      observaciones: 'Nota',
    });
  });

  it('conserva grupoCoberturaId si viene informado', () => {
    expect(
      normalizeTeletrabajoPuestoDraft({
        puesto: 'Recepcionista',
        maxSolicitudes: 0,
        dotacionComputable: 1,
        grupoCoberturaId: 'grupo-123',
        observaciones: '',
      }),
    ).toMatchObject({ grupoCoberturaId: 'grupo-123' });
  });

  it('aplica valores por defecto cuando faltan campos', () => {
    expect(normalizeTeletrabajoPuestoDraft({})).toEqual({
      puesto: '',
      maxSolicitudes: 0,
      dotacionComputable: 0,
      grupoCoberturaId: null,
      observaciones: '',
    });
  });
});

describe('rowsToTeletrabajoPuestoDrafts', () => {
  it('parsea filas con cabecera estándar, deduplica por puesto y devuelve el nombre de grupo en texto', () => {
    const rows = [
      ['Puesto Organizativo', 'Presencialidad mínima', 'Dotación', 'Grupo cobertura', 'Observaciones'],
      ['Recepcionista turno mañana', '2', '1', 'Recepción', 'Turno mañana'],
      ['Recepcionista turno tarde', '2', '1', 'Recepción', ''],
      ['Administrativo/a', '0', '1', '', ''],
    ];

    const result = rowsToTeletrabajoPuestoDrafts(rows);

    expect(result).toHaveLength(3);
    const recepcionMañana = result.find((row) => row.draft.puesto === 'Recepcionista turno mañana');
    expect(recepcionMañana).toMatchObject({
      draft: { maxSolicitudes: 2, dotacionComputable: 1, observaciones: 'Turno mañana' },
      grupoCoberturaNombre: 'Recepción',
    });

    const administrativo = result.find((row) => row.draft.puesto === 'Administrativo/a');
    expect(administrativo).toMatchObject({
      draft: { maxSolicitudes: 0, dotacionComputable: 1 },
      grupoCoberturaNombre: '',
    });
  });

  it('importa la columna Dotación computable cuando viene con el formato de muestra', () => {
    const rows = [
      ['Puesto Organizativo', 'Presencialidad mínima', 'Dotación computable', 'Grupo cobertura', 'Observaciones'],
      ['Análisis Informático (Desarrollo)', '4', '7', '', ''],
    ];

    const result = rowsToTeletrabajoPuestoDrafts(rows);

    expect(result).toHaveLength(1);
    expect(result[0]?.draft).toMatchObject({
      puesto: 'Análisis Informático (Desarrollo)',
      maxSolicitudes: 4,
      dotacionComputable: 7,
    });
  });

  it('lanza un error claro cuando falta la columna de Puesto', () => {
    const rows = [
      ['Presencialidad mínima', 'Observaciones'],
      ['2', 'Nota'],
    ];

    expect(() => rowsToTeletrabajoPuestoDrafts(rows)).toThrow(/Puesto Organizativo/);
  });

  it('filtra filas marcadas explícitamente como no teletrabajables', () => {
    const rows = [
      ['Puesto', 'Teletrabajo S/N'],
      ['Recepcionista', 'Sí'],
      ['Conserje', 'No'],
    ];

    const result = rowsToTeletrabajoPuestoDrafts(rows);

    expect(result.map((row) => row.draft.puesto)).toEqual(['Recepcionista']);
  });

  it('devuelve array vacío si no hay filas de cabecera', () => {
    expect(rowsToTeletrabajoPuestoDrafts([])).toEqual([]);
  });
});
