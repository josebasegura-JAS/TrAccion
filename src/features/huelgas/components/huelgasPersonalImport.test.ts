import { describe, expect, it } from 'vitest';
import { parseHuelgaPersonalRows } from './huelgasPersonalImport';

const headers = [
  'Resi./Estac.',
  'Inicio',
  'Salida',
  'Entrada',
  'Fin',
  'Nombre y Apellidos',
  'Puesto',
  'Turno',
];

describe('parseHuelgaPersonalRows — caracterización', () => {
  it('propaga la residencia del bloque y normaliza horas de Excel', () => {
    const result = parseHuelgaPersonalRows([
      headers,
      ['Taller Ariz', '0,25', '07:05', '0.5', '45200.75', 'Álvaro López', 'Mecánico', 'M'],
      ['', '0.125', '', '', '1', 'Beñat Ruiz', 'Mecánico', 'T'],
    ]);

    expect(result.skippedRows).toBe(0);
    expect(result.records).toEqual([
      {
        id: 'turno-2-alvaro-lopez',
        residenciaEstacion: 'Taller Ariz',
        inicio: '06:00',
        salida: '07:05',
        entrada: '12:00',
        fin: '18:00',
        nombreApellidos: 'Álvaro López',
        puesto: 'Mecánico',
        turno: 'M',
      },
      {
        id: 'turno-3-benat-ruiz',
        residenciaEstacion: 'Taller Ariz',
        inicio: '03:00',
        salida: '',
        entrada: '',
        fin: '00:00',
        nombreApellidos: 'Beñat Ruiz',
        puesto: 'Mecánico',
        turno: 'T',
      },
    ]);
  });

  it('tolera mayúsculas, espacios y NBSP en cabeceras y textos', () => {
    const result = parseHuelgaPersonalRows([
      ['  RESI./ESTAC. ', ' INICIO ', 'SALIDA', 'ENTRADA', 'FIN', ' NOMBRE Y APELLIDOS ', 'PUESTO', 'TURNO'],
      ['Oficinas\u00a0Centrales', '', '', '', '', '  Ana\u00a0  García ', ' Técnica ', ' JP '],
    ]);

    expect(result.records[0]).toMatchObject({
      residenciaEstacion: 'Oficinas Centrales',
      nombreApellidos: 'Ana García',
      puesto: 'Técnica',
      turno: 'JP',
    });
  });

  it('cuenta como omitida una fila con datos pero sin nombre', () => {
    const result = parseHuelgaPersonalRows([
      headers,
      ['Sopela Taller', '', '', '', '', '', 'Mecánico', 'M'],
      ['', '', '', '', '', 'Persona Válida', 'Mecánico', 'M'],
    ]);

    expect(result.skippedRows).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].residenciaEstacion).toBe('Sopela Taller');
  });

  it('rechaza Excel vacío o con columnas obligatorias ausentes', () => {
    expect(() => parseHuelgaPersonalRows([])).toThrow('El Excel no contiene filas para importar.');
    expect(() => parseHuelgaPersonalRows([headers.slice(0, -1)])).toThrow('Faltan columnas: turno');
  });

  it('rechaza un Excel sin ninguna persona identificable', () => {
    expect(() => parseHuelgaPersonalRows([
      headers,
      ['Taller Ariz', '', '', '', '', '', '', ''],
    ])).toThrow('No se ha encontrado personal con nombre y apellidos en el Excel.');
  });
});
