import { describe, expect, it } from 'vitest';
import { EMPTY_EMPLOYEE_DRAFT } from './employee';
import { hydrateEmployee, buildDireccionTeletrabajo, normalizeDni, buildResidenciaEus } from './derived';
import { normalizeJobPosition, isJobPositionTranslationPending } from './jobPositionTranslation';
import { findActiveEmployeeSuggestion, searchActiveEmployeeSuggestions } from './employeeMaster';

describe('T7A: datos maestros de Plantilla', () => {
  it('deriva DNI, residencia bilingüe y dirección sin espacios vacíos', () => {
    const employee = hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado: '100', nif: ' es 12345678 z ', residencia: 'Oficinas Centrales', calle: ' Calle ficticia ', numero: ' 5 ', poblacion: 'Bilbao' });
    // El prefijo ES se elimina después de normalizar espacios.
    expect(employee.dni).toBe('12345678Z');
    expect(employee.residenciaCast).toBe('Oficinas Centrales');
    expect(employee.residenciaEus).toBe('Bulego Nagusiak');
    expect(employee.direccionTeletrabajo).toBe('Calle ficticia 5 Bilbao');
  });
  it('conserva la baja y rellena campos ausentes de registros antiguos', () => {
    const { email, puestoEus, unidad, direccionOrganizativa, antiguedadPuesto, telefono1, telefono2, ...legacy } = EMPTY_EMPLOYEE_DRAFT;
    expect([email, puestoEus, unidad, direccionOrganizativa, antiguedadPuesto, telefono1, telefono2]).toEqual(Array(7).fill(''));
    expect(hydrateEmployee(legacy, '2026-01-01')).toMatchObject({ email: '', puestoEus: '', unidad: '', direccionOrganizativa: '', antiguedadPuesto: '', telefono1: '', telefono2: '', deletedAt: '2026-01-01' });
  });
  it('no inventa traducciones de residencias desconocidas ni partes de dirección', () => {
    expect(buildResidenciaEus('Otra residencia')).toBe('Otra residencia');
    expect(buildDireccionTeletrabajo(EMPTY_EMPLOYEE_DRAFT)).toBe('');
    expect(normalizeDni('')).toBe('');
  });
  it('normaliza puestos para comparar y distingue traducciones pendientes', () => {
    expect(normalizeJobPosition(' TÉCNICO   RRLL ')).toBe('tecnico rrll');
    expect(isJobPositionTranslationPending({ puestoCastellano: 'Técnico', puestoEuskera: ' ' })).toBe(true);
    expect(isJobPositionTranslationPending({ puestoCastellano: 'Técnico', puestoEuskera: 'Teknikaria' })).toBe(false);
  });
  it('devuelve sugerencias activas ordenadas numéricamente y limitadas', () => {
    const employees = ['10', '2', '3'].map(empleado => hydrateEmployee({ ...EMPTY_EMPLOYEE_DRAFT, empleado, nombreApellidos: 'Álvarez' }, empleado === '3' ? '2026-01-01' : null));
    expect(searchActiveEmployeeSuggestions(employees, 'alvarez', 1)).toEqual([{ empleado: '2', nombreApellidos: 'Álvarez' }]);
    expect(findActiveEmployeeSuggestion(employees, '00010')).toEqual({ empleado: '10', nombreApellidos: 'Álvarez' });
    expect(findActiveEmployeeSuggestion(employees, '3')).toBeNull();
    expect(searchActiveEmployeeSuggestions(employees, '')).toEqual([]);
  });
});
