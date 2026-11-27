import { describe, expect, it } from 'vitest';
import { buildVinculograma, calculateExpiryDate, getVinculogramaStatus, splitVinculogramasByStatus, type VinculogramaDraft } from './vinculograma';
const stamp = '2026-01-01T00:00:00.000Z';
const draft: VinculogramaDraft = { employeeNumber: '100', nombreCompleto: 'Persona ficticia', linkedPerson: 'Vínculo ficticio', requestDate: '2026-01-01' };
describe('T7B: vigencia y revocación de Vinculograma', () => {
  it('ajusta el vencimiento de una solicitud de año bisiesto', () => {
    expect(calculateExpiryDate('2024-02-29')).toBe('2027-02-28');
    expect(calculateExpiryDate('')).toBe('');
  });
  it('prioriza revocación aunque el vínculo no haya vencido', () => {
    expect(getVinculogramaStatus('2029-01-01', '2026-01-01', '2026-01-01')).toBe('Revocado');
  });
  it('mantiene los datos de revocación si no se modifican explícitamente', () => {
    const previous = buildVinculograma({ ...draft, revokedAt: '2026-02-01', revocationReason: ' Motivo ' }, stamp, 'a');
    const updated = buildVinculograma({ ...draft, linkedPerson: ' Persona corregida ' }, '2026-03-01', 'a', previous);
    expect(updated).toMatchObject({ id: 'a', createdAt: stamp, revokedAt: '2026-02-01', revocationReason: 'Motivo', linkedPerson: 'Persona corregida' });
  });
  it('separa activos, vencidos y revocados sin incluir bajas lógicas', () => {
    const current = buildVinculograma(draft, stamp, 'a');
    const expired = buildVinculograma({ ...draft, employeeNumber: '2', requestDate: '2020-01-01' }, stamp, 'b');
    const revoked = buildVinculograma({ ...draft, employeeNumber: '10', revokedAt: '2026-01-01' }, stamp, 'c');
    const deleted = { ...current, id: 'd', deletedAt: stamp };
    expect(splitVinculogramasByStatus([revoked, current, deleted, expired], '2026-01-01')).toEqual({ vigentes: [current], vencidos: [expired, revoked] });
  });
});
