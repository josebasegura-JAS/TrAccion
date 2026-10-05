import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_EMPLOYEE_DRAFT, type Employee } from '../../plantilla/domain/employee';
import { buildLotteryImportReview } from './matchLotteryPeople';

function employee(
  empleado: string,
  nombreApellidos: string,
  deletedAt: string | null = null,
): Employee {
  return {
    ...EMPTY_EMPLOYEE_DRAFT,
    empleado,
    nombreApellidos,
    dni: '',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt,
  };
}

describe('Lotería - emparejamiento de participantes con Plantilla', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marca como exacta una coincidencia normalizada ignorando mayúsculas y tildes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const review = buildLotteryImportReview(
      [{ nombre: 'alvaro garcia lopez', email: '', telefono: '' }],
      [employee('100', 'Álvaro García López')],
    );

    expect(review).toHaveLength(1);
    expect(review[0]).toMatchObject({
      id: 'loteria-import-1000-0',
      matchKind: 'exact',
      selectedEmpleado: '100',
      externa: false,
    });
    expect(review[0].candidates[0]).toMatchObject({ empleado: '100', score: 100 });
  });

  it('propone automáticamente el mejor candidato cuando la similitud supera el umbral', () => {
    const review = buildLotteryImportReview(
      [{ nombre: 'Mikel Grcia Lopez', email: '', telefono: '' }],
      [
        employee('101', 'Mikel García López'),
        employee('102', 'Ane Fernández Ruiz'),
      ],
    );

    expect(review[0].matchKind).toBe('suggested');
    expect(review[0].selectedEmpleado).toBe('101');
    expect(review[0].externa).toBe(false);
    expect(review[0].candidates[0].empleado).toBe('101');
    expect(review[0].candidates[0].score).toBeGreaterThanOrEqual(60);
    expect(review[0].candidates[0].score).toBeLessThan(100);
  });

  it('marca como externa una persona sin candidato suficientemente parecido', () => {
    const review = buildLotteryImportReview(
      [{ nombre: 'Empresa Invitada SL', email: 'externa@test', telefono: '' }],
      [employee('101', 'Mikel García López')],
    );

    expect(review[0]).toMatchObject({
      matchKind: 'none',
      selectedEmpleado: null,
      externa: true,
    });
  });

  it('excluye de los candidatos a empleados borrados y a registros sin nombre', () => {
    const blank = employee('blank', '   ');
    const deleted = employee('deleted', 'Ana Pérez López', '2026-09-01T00:00:00.000Z');
    const active = employee('active', 'Ana Perez Lopez');

    const review = buildLotteryImportReview(
      [{ nombre: 'Ana Pérez López', email: '', telefono: '' }],
      [blank, deleted, active],
    );

    expect(review[0].candidates.map((candidate) => candidate.empleado)).toEqual(['active']);
    expect(review[0].selectedEmpleado).toBe('active');
  });

  it('limita la lista de revisión a los 6 mejores candidatos', () => {
    const employees = Array.from({ length: 10 }, (_, index) =>
      employee(String(index + 1), `Persona Prueba ${String(index + 1).padStart(2, '0')}`),
    );

    const review = buildLotteryImportReview(
      [{ nombre: 'Persona Prueba', email: '', telefono: '' }],
      employees,
    );

    expect(review[0].candidates).toHaveLength(6);
    expect(review[0].candidates.every((candidate, index, all) =>
      index === 0 || all[index - 1].score >= candidate.score,
    )).toBe(true);
  });

  it('ordena alfabéticamente los candidatos cuando tienen la misma puntuación', () => {
    const review = buildLotteryImportReview(
      [{ nombre: 'ZZZ', email: '', telefono: '' }],
      [
        employee('2', 'Beatriz Test'),
        employee('1', 'Ana Test'),
      ],
    );

    expect(review[0].candidates.map((candidate) => candidate.nombreApellidos)).toEqual([
      'Ana Test',
      'Beatriz Test',
    ]);
  });

  it('genera una revisión independiente por cada fila importada conservando el original', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const imported = [
      { nombre: 'Ana Perez Lopez', email: 'ana@test', telefono: '600000001' },
      { nombre: 'Persona Externa', email: 'externa@test', telefono: '600000002' },
    ];

    const review = buildLotteryImportReview(imported, [employee('1', 'Ana Pérez López')]);

    expect(review.map((item) => item.id)).toEqual([
      'loteria-import-2000-0',
      'loteria-import-2000-1',
    ]);
    expect(review[0].imported).toBe(imported[0]);
    expect(review[1].imported).toBe(imported[1]);
  });
});
