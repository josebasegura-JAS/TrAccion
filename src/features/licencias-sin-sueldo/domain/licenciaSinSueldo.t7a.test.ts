import { describe, expect, it } from 'vitest';
import { EMPTY_LICENCIA_SIN_SUELDO_DRAFT, buildLicenciaSinSueldoRecord, validateLicenciaSinSueldoDraft, canProrrogarExcedencia, validateProrrogaExcedencia, getEffectiveLicenciaEstado, addOneDayIso, addYearsClamped, visibleLicenciasSinSueldo } from './licenciaSinSueldo';
const stamp = '2026-01-01T00:00:00.000Z';
const draft = { ...EMPTY_LICENCIA_SIN_SUELDO_DRAFT, numeroEmpleado: '100', nombreCompleto: 'Persona ficticia', fechaSolicitud: '2026-01-01', fechaInicio: '2026-02-01', fechaFin: '2026-11-01' };
const record = buildLicenciaSinSueldoRecord({ ...draft, tipo: 'Excedencia', estado: 'vigente' }, stamp, 'a');
describe('T7A: límites de licencias y prórrogas', () => {
  it('acepta exactamente nueve meses', () => expect(validateLicenciaSinSueldoDraft(draft).ok).toBe(true));
  it('ajusta el límite de nueve meses al último día del mes', () => {
    expect(validateLicenciaSinSueldoDraft({ ...draft, fechaInicio: '2026-05-31', fechaFin: '2027-02-28' }).ok).toBe(true);
    expect(validateLicenciaSinSueldoDraft({ ...draft, fechaInicio: '2026-05-31', fechaFin: '2027-03-01' }).ok).toBe(false);
  });
  it('ajusta el aniversario de una fecha bisiesta', () => {
    expect(addYearsClamped('2024-02-29', 5)).toBe('2029-02-28');
    expect(addYearsClamped('invalid', 5)).toBe('');
  });
  it('normaliza actualizaciones y descarta motivos vacíos', () => {
    const denied = { ...draft, estado: 'denegada' as const, actualizaciones: [{ id: 'x', fecha: stamp, texto: ' ' }] };
    expect(validateLicenciaSinSueldoDraft(denied).ok).toBe(false);
    expect(buildLicenciaSinSueldoRecord(denied, stamp, 'x').actualizaciones).toEqual([]);
  });
  it('conserva identidad temporal y prórroga al editar una excedencia', () => {
    const previous = { ...record, prorroga: { fechaInicio: '2026-11-02', fechaFin: '2027-01-01', createdAt: stamp } };
    const next = buildLicenciaSinSueldoRecord({ ...draft, tipo: 'Excedencia', observaciones: ' Revisado ' }, '2026-02-01', 'a', previous);
    expect(next).toMatchObject({ id: 'a', createdAt: stamp, prorroga: previous.prorroga, observaciones: 'Revisado' });
  });
  it('mantiene vigente hasta el último día de la prórroga', () => {
    const extended = { ...record, prorroga: { fechaInicio: '2026-11-02', fechaFin: '2027-01-01', createdAt: stamp } };
    expect(getEffectiveLicenciaEstado(extended, '2027-01-01')).toBe('vigente');
    expect(getEffectiveLicenciaEstado(extended, '2027-01-02')).toBe('historico');
    expect(getEffectiveLicenciaEstado({ ...extended, estado: 'denegada' }, '2027-01-02')).toBe('denegada');
  });
  it('solo ofrece prórroga a excedencias vigentes no prorrogadas', () => {
    expect(canProrrogarExcedencia(record, '2026-11-01')).toBe(true);
    expect(canProrrogarExcedencia(record, '2026-11-02')).toBe(false);
    expect(canProrrogarExcedencia({ ...record, tipo: 'Licencia sin sueldo' }, '2026-10-01')).toBe(false);
    expect(canProrrogarExcedencia({ ...record, estado: 'historico' }, '2026-10-01')).toBe(false);
    expect(canProrrogarExcedencia({ ...record, prorroga: { fechaInicio: '2026-11-02', fechaFin: '2027-01-01', createdAt: stamp } }, '2026-10-01')).toBe(false);
  });
  it.each([['2026-11-01', '2027-01-01'], ['2026-11-02', '2026-11-01'], ['', '2027-01-01'], ['2026-11-02', '']])('rechaza prórroga inválida %s / %s', (inicio, fin) => {
    expect(validateProrrogaExcedencia(record, inicio, fin).ok).toBe(false);
  });
  it('acepta la prórroga desde el día posterior al fin', () => {
    expect(validateProrrogaExcedencia(record, addOneDayIso(record.fechaFin), '2027-01-01').ok).toBe(true);
    expect(addOneDayIso('2026-12-31')).toBe('2027-01-01');
    expect(addOneDayIso('')).toBe('');
  });
  it('excluye las bajas lógicas sin modificar el histórico', () => {
    const records = [record, { ...record, id: 'b', deletedAt: stamp }];
    expect(visibleLicenciasSinSueldo(records)).toEqual([record]);
    expect(records).toHaveLength(2);
  });
});
