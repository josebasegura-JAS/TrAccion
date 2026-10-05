import { describe, expect, it } from 'vitest';
import { findEmployeeCandidates, normalizeEmail, normalizePersonName } from './ayudaEscolar';

const employees = [
  { empleado: '1', nombreApellidos: 'José María Núñez Peña', email: '', deletedAt: null },
  { empleado: '2', nombreApellidos: 'Jose Maria Nunez Pena', email: '', deletedAt: null },
  { empleado: '3', nombreApellidos: 'Álvaro García López', email: 'alvaro@empresa.test', deletedAt: null },
  { empleado: '4', nombreApellidos: 'Marta López Ruiz', email: 'marta@empresa.test', deletedAt: '2026-01-01T00:00:00.000Z' },
  { empleado: '5', nombreApellidos: 'Marta Lopez Ruiz', email: '', deletedAt: null },
];

describe('Ayuda escolar - identificación de personas', () => {
  it('ignora tildes de vocales y conserva la ñ como letra distinta', () => {
    expect(normalizePersonName('  JOSÉ   MARÍA Núñez  ')).toBe('jose maria nuñez');
    expect(normalizePersonName('Peña')).toBe('peña');
    expect(normalizePersonName('Pena')).toBe('pena');
  });

  it('normaliza unicode, signos y espacios sin perder la ñ', () => {
    expect(normalizePersonName('  IÑAKI\u00a0PÉREZ-GÓMEZ (RRLL) ')).toBe('iñaki perez gomez rrll');
  });

  it('normaliza el email ignorando mayúsculas y espacios exteriores', () => {
    expect(normalizeEmail('  PERSONA@Empresa.TEST  ')).toBe('persona@empresa.test');
  });

  it('identifica nombres con tildes aunque Outlook entregue el nombre sin ellas', () => {
    const candidates = findEmployeeCandidates('Alvaro Garcia Lopez', employees);
    expect(candidates.map((employee) => employee.empleado)).toEqual(['3']);
  });

  it('prioriza una coincidencia exacta de email aunque el nombre no coincida', () => {
    const candidates = findEmployeeCandidates('Nombre distinto', employees, 'ALVARO@EMPRESA.TEST');
    expect(candidates.map((employee) => employee.empleado)).toEqual(['3']);
  });

  it('ignora empleados borrados incluso cuando coincide exactamente su email', () => {
    const candidates = findEmployeeCandidates('Marta Lopez Ruiz', employees, 'marta@empresa.test');
    expect(candidates.map((employee) => employee.empleado)).toEqual(['5']);
  });

  it('devuelve varios candidatos cuando el nombre aportado no permite desambiguar', () => {
    const candidates = findEmployeeCandidates('Jose Maria', employees);
    expect(candidates.map((employee) => employee.empleado)).toEqual(['1', '2']);
  });

  it('mantiene solo los candidatos cercanos a la mejor puntuación', () => {
    const candidates = findEmployeeCandidates('Jose Maria Nunez', employees);
    expect(candidates.map((employee) => employee.empleado)).toEqual(['2']);
  });

  it('no propone candidatos si Outlook no aporta un nombre útil', () => {
    expect(findEmployeeCandidates('   ', employees)).toEqual([]);
    expect(findEmployeeCandidates('A B', employees)).toEqual([]);
  });
});
