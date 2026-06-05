import { describe, expect, it } from 'vitest';
import { normalizeDni, translateResidenciaEus } from './employeeDerived';

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
});
