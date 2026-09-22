import { describe, expect, it } from 'vitest';
import { findEmployeeCandidates, normalizePersonName } from './ayudaEscolar';

const employees = [
  { empleado: '1', nombreApellidos: 'José María Núñez Peña', email: '', deletedAt: null },
  { empleado: '2', nombreApellidos: 'Jose Maria Nunez Pena', email: '', deletedAt: null },
  { empleado: '3', nombreApellidos: 'Álvaro García López', email: 'alvaro@empresa.test', deletedAt: null },
];

describe('Ayuda escolar - identificación de personas', () => {
  it('ignora tildes de vocales y conserva la ñ como letra distinta', () => {
    expect(normalizePersonName('  JOSÉ   MARÍA Núñez  ')).toBe('jose maria nuñez');
    expect(normalizePersonName('Peña')).toBe('peña');
    expect(normalizePersonName('Pena')).toBe('pena');
  });

  it('identifica nombres con tildes aunque Outlook entregue el nombre sin ellas', () => {
    const candidates = findEmployeeCandidates('Alvaro Garcia Lopez', employees);
    expect(candidates.map((employee) => employee.empleado)).toEqual(['3']);
  });

  it('prioriza una coincidencia exacta de email cuando se facilita', () => {
    const candidates = findEmployeeCandidates('Nombre distinto', employees, 'ALVARO@EMPRESA.TEST');
    expect(candidates.map((employee) => employee.empleado)).toEqual(['3']);
  });
});
