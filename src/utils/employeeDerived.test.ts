import { describe, expect, it } from 'vitest';
import { buildDireccionTeletrabajo, normalizeDni, translateResidenciaEus } from './employeeDerived';
import { rowsToEmployeeDrafts } from '../features/plantilla/domain/importExcel';

describe('employee derived field helpers', () => {
  it('normaliza NIF eliminando prefijo ES, espacios y convirtiendo a mayúsculas', () => {
    expect(normalizeDni(' ES 12345678 z ')).toBe('12345678Z');
    expect(normalizeDni('es44555111a')).toBe('44555111A');
  });

  it('traduce residenciaEus para residencias conocidas y conserva el resto', () => {
    expect(translateResidenciaEus('Oficinas Centrales')).toBe('Bulego Nagusiak');
    expect(translateResidenciaEus('Sopela Taller')).toBe('Sopela Tailerra');
    expect(translateResidenciaEus('Ariz Taller')).toBe('Ariz Tailerra');
    expect(translateResidenciaEus('Lutxana')).toBe('Lutxana');
  });

  it('concatena la dirección de teletrabajo sin dobles espacios ni separadores extra', () => {
    expect(
      buildDireccionTeletrabajo({
        calle: 'Gran Vía',
        numero: '12',
        piso: '3ºA',
        codigoPostal: '48001',
        poblacion: 'Bilbao',
        provincia: 'Bizkaia',
      }),
    ).toBe('Gran Vía 12 3ºA 48001 Bilbao Bizkaia');
  });
});

describe('employee Excel import mapping', () => {
  it('importa solo columnas de plantilla e ignora columnas desconocidas', () => {
    expect(
      rowsToEmployeeDrafts([
        ['empleado', 'nombreApellidos', 'campo desconocido', 'nif'],
        ['100', 'Ane Bilbao', 'ignorado', 'es 12345678 z'],
      ]),
    ).toEqual([
      expect.objectContaining({
        empleado: '100',
        nombreApellidos: 'Ane Bilbao',
        nif: 'es 12345678 z',
      }),
    ]);
  });
});
