import { describe, expect, it } from 'vitest';
import type { Employee } from '../../plantilla/domain/employee';
import {
  addManualExclusion,
  deleteSorteo,
  filterAvailablePeople,
  hasDuplicateExclusion,
  normalizeSorteosPerson,
  normalizeSorteosPeople,
  runSorteo,
  searchPeopleForExclusion,
  SORTEOS_WINNER_EXCLUSION_REASON,
  validateSorteosDraft,
  type SorteosDraw,
  type SorteosExclusion,
} from './sorteos';

const timestamp = '2026-06-06T00:00:00.000Z';

function employee(overrides: Partial<Employee> = {}): Employee {
  return {
    empleado: '1001',
    nombreApellidos: 'Ana García López',
    puestoNomina: '',
    puestoOrganizativo: '',
    residencia: '',
    nivelRetributivo: '',
    sexo: '',
    calle: '',
    numero: '',
    piso: '',
    codigoPostal: '',
    poblacion: '',
    provincia: '',
    nif: '',
    dni: '',
    residenciaCast: '',
    residenciaEus: '',
    direccionTeletrabajo: '',
    deletedAt: null,
    ...overrides,
  };
}

function exclusion(overrides: Partial<SorteosExclusion> = {}): SorteosExclusion {
  return {
    id: 'exclusion-1',
    empleado: '1001',
    nombreApellidos: 'Ana García López',
    reason: 'Manual',
    drawId: null,
    createdAt: timestamp,
    excludedAt: timestamp,
    ...overrides,
  };
}

describe('sorteos domain', () => {
  it('normaliza persona desde Employee actual', () => {
    expect(normalizeSorteosPerson(employee())).toMatchObject({
      empleado: '1001',
      nombreApellidos: 'Ana García López',
      searchText: '1001 ana garcia lopez',
    });
    expect(normalizeSorteosPerson(employee({ deletedAt: timestamp }))).toBeNull();
  });

  it('filtra disponibles excluyendo personas', () => {
    const people = normalizeSorteosPeople([
      employee(),
      employee({ empleado: '1002', nombreApellidos: 'Bea Ruiz' }),
    ]);

    expect(filterAvailablePeople(people, [exclusion()]).map((person) => person.empleado)).toEqual([
      '1002',
    ]);
  });

  it('detecta duplicados por nº empleado', () => {
    expect(
      hasDuplicateExclusion(
        [exclusion({ empleado: '1001', nombreApellidos: 'Otro Nombre' })],
        { empleado: '1001', nombreApellidos: 'Ana García López' },
      ),
    ).toBe(true);
  });

  it('ejecuta sorteo con número correcto de ganadores', () => {
    const people = normalizeSorteosPeople([
      employee({ empleado: '1001', nombreApellidos: 'Ana García' }),
      employee({ empleado: '1002', nombreApellidos: 'Bea Ruiz' }),
      employee({ empleado: '1003', nombreApellidos: 'Carlos Pérez' }),
    ]);

    const result = runSorteo(
      { title: 'Sorteo junio', date: '2026-06-06', winnersCount: 2 },
      people,
      [],
      'draw-1',
      (position) => `winner-${position}`,
      timestamp,
      () => 0,
    );

    expect(result.draw.winners).toHaveLength(2);
    expect(result.draw.winners.map((winner) => winner.position)).toEqual([1, 2]);
  });

  it('añade ganadores a exclusiones con drawId', () => {
    const people = normalizeSorteosPeople([
      employee({ empleado: '1001', nombreApellidos: 'Ana García' }),
      employee({ empleado: '1002', nombreApellidos: 'Bea Ruiz' }),
    ]);

    const result = runSorteo(
      { title: 'Sorteo junio', date: '2026-06-06', winnersCount: 1 },
      people,
      [],
      'draw-1',
      (position) => `winner-${position}`,
      timestamp,
      () => 0,
    );

    expect(result.exclusions).toEqual([
      expect.objectContaining({ drawId: 'draw-1', reason: SORTEOS_WINNER_EXCLUSION_REASON }),
    ]);
  });

  it('elimina sorteo y, si procede, exclusiones vinculadas', () => {
    const draw: SorteosDraw = {
      id: 'draw-1',
      title: 'Sorteo junio',
      date: '2026-06-06',
      winners: [],
      createdAt: timestamp,
    };
    const result = deleteSorteo([draw], [exclusion({ drawId: 'draw-1', reason: SORTEOS_WINNER_EXCLUSION_REASON })], 'draw-1', true);

    expect(result.draws).toEqual([]);
    expect(result.exclusions).toEqual([]);
  });

  it('busca por nº empleado y nombre', () => {
    const people = normalizeSorteosPeople([
      employee({ empleado: '1001', nombreApellidos: 'Ana García' }),
      employee({ empleado: '1002', nombreApellidos: 'Bea Ruiz' }),
    ]);

    expect(searchPeopleForExclusion(people, [], '1002')).toEqual([
      expect.objectContaining({ empleado: '1002' }),
    ]);
    expect(searchPeopleForExclusion(people, [], 'garcia')).toEqual([
      expect.objectContaining({ empleado: '1001' }),
    ]);
    expect(searchPeopleForExclusion(people, [], 'a')).toEqual([]);
  });

  it('valida nº ganadores superior a disponibles', () => {
    const people = normalizeSorteosPeople([employee()]);
    const validation = validateSorteosDraft(
      { title: 'Sorteo junio', date: '2026-06-06', winnersCount: 2 },
      people,
      [],
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('El nº de ganadores no puede superar las personas disponibles.');
  });

  it('evita duplicados al excluir manualmente', () => {
    const people = normalizeSorteosPeople([employee()]);
    const exclusions = addManualExclusion([], people[0], 'manual-1', timestamp);

    expect(addManualExclusion(exclusions, people[0], 'manual-2', timestamp)).toHaveLength(1);
  });
});
