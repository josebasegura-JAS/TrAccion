import { describe, expect, it } from 'vitest';
import {
  calculateFechaFinForTipo,
  validateLicenciaSinSueldoDraft,
  type LicenciaSinSueldoDraft,
} from './licenciaSinSueldo';

const baseDraft: LicenciaSinSueldoDraft = {
  numeroEmpleado: '123',
  nombreCompleto: 'Persona de prueba',
  tipo: 'Licencia sin sueldo',
  fechaSolicitud: '2026-01-01',
  fechaInicio: '2026-02-01',
  fechaFin: '2026-02-15',
  estado: 'pendiente_aprobacion',
  observaciones: '',
  actualizaciones: [],
};

describe('licencias sin sueldo', () => {
  it('acepta una licencia sin sueldo de 15 días naturales', () => {
    expect(validateLicenciaSinSueldoDraft(baseDraft).ok).toBe(true);
  });

  it('bloquea licencias sin sueldo inferiores a 15 días naturales', () => {
    const result = validateLicenciaSinSueldoDraft({ ...baseDraft, fechaFin: '2026-02-14' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('La licencia sin sueldo debe durar como mínimo 15 días naturales.');
  });

  it('bloquea licencias sin sueldo superiores a 9 meses', () => {
    const result = validateLicenciaSinSueldoDraft({ ...baseDraft, fechaFin: '2026-11-02' });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain('La licencia sin sueldo no puede superar 9 meses.');
  });

  it('calcula la fecha fin del Año de Libre Disposición a 5 años', () => {
    expect(calculateFechaFinForTipo('Año de Libre Disposición', '2026-06-07')).toBe('2031-06-07');
  });
});
