import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SORTEOS_WINNER_EXCLUSION_REASON,
  type SorteosDraw,
  type SorteosExclusion,
  type SorteosPerson,
} from '../domain/sorteos';
import { DRAWS_STORAGE_KEY, EXCLUSIONS_STORAGE_KEY, useSorteosStore } from './useSorteosStore';

const timestamp = '2026-06-17T08:00:00.000Z';

function person(overrides: Partial<SorteosPerson> = {}): SorteosPerson {
  const empleado = overrides.empleado ?? '1001';
  const nombreApellidos = overrides.nombreApellidos ?? 'Ana García López';
  return {
    empleado,
    nombreApellidos,
    searchText: `${empleado} ${nombreApellidos}`.toLowerCase(),
    ...overrides,
  };
}

function draw(overrides: Partial<SorteosDraw> = {}): SorteosDraw {
  return {
    id: 'draw-1',
    title: 'Sorteo junio',
    date: '2026-06-17',
    winners: [{ position: 1, empleado: '1001', nombreApellidos: 'Ana García López' }],
    createdAt: timestamp,
    ...overrides,
  };
}

function exclusion(overrides: Partial<SorteosExclusion> = {}): SorteosExclusion {
  return {
    id: 'exclusion-1',
    empleado: '1001',
    nombreApellidos: 'Ana García López',
    reason: SORTEOS_WINNER_EXCLUSION_REASON,
    drawId: 'draw-1',
    createdAt: timestamp,
    excludedAt: timestamp,
    ...overrides,
  };
}

function readDraws(): SorteosDraw[] {
  return JSON.parse(window.localStorage.getItem(DRAWS_STORAGE_KEY) ?? '[]') as SorteosDraw[];
}

function readExclusions(): SorteosExclusion[] {
  return JSON.parse(window.localStorage.getItem(EXCLUSIONS_STORAGE_KEY) ?? '[]') as SorteosExclusion[];
}

describe('useSorteosStore persistence', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(timestamp));
    window.localStorage.clear();
    Object.defineProperty(window, 'traccion', { configurable: true, value: undefined });
    useSorteosStore.setState({ draws: [], exclusions: [], visibleDrawId: '', visibleResult: null });
  });

  it('crea un sorteo, persiste ganadores y recarga el resultado visible', () => {
    const result = useSorteosStore.getState().createDraw(
      { title: ' Sorteo junio ', date: '2026-06-17', winnersCount: 1 },
      [person(), person({ empleado: '1002', nombreApellidos: 'Bea Ruiz' })],
    );

    expect(result.valid).toBe(true);
    const [created] = useSorteosStore.getState().draws;
    expect(created).toMatchObject({ title: 'Sorteo junio', date: '2026-06-17' });
    expect(created.winners).toHaveLength(1);
    expect(useSorteosStore.getState().visibleDrawId).toBe(created.id);
    expect(readDraws()[0].id).toBe(created.id);
    expect(readExclusions()).toEqual([
      expect.objectContaining({ drawId: created.id, reason: SORTEOS_WINNER_EXCLUSION_REASON }),
    ]);

    useSorteosStore.setState({ draws: [], exclusions: [], visibleDrawId: '', visibleResult: null });
    useSorteosStore.getState().load();

    expect(useSorteosStore.getState().draws[0].id).toBe(created.id);
    expect(useSorteosStore.getState().exclusions).toHaveLength(1);
  });

  it('añade exclusión manual una sola vez y la conserva al recargar', () => {
    const candidate = person({ empleado: '2001', nombreApellidos: 'Carlos Pérez' });

    useSorteosStore.getState().addExclusion(candidate);
    useSorteosStore.getState().addExclusion(candidate);

    expect(useSorteosStore.getState().exclusions).toHaveLength(1);
    expect(useSorteosStore.getState().exclusions[0]).toMatchObject({
      empleado: '2001',
      nombreApellidos: 'Carlos Pérez',
      reason: 'Manual',
      drawId: null,
    });
    expect(readExclusions()).toHaveLength(1);

    useSorteosStore.setState({ draws: [], exclusions: [], visibleDrawId: '', visibleResult: null });
    useSorteosStore.getState().load();

    expect(useSorteosStore.getState().exclusions).toHaveLength(1);
  });

  it('elimina un sorteo y desbloquea sus ganadores si se solicita', () => {
    window.localStorage.setItem(DRAWS_STORAGE_KEY, JSON.stringify([draw()]));
    window.localStorage.setItem(
      EXCLUSIONS_STORAGE_KEY,
      JSON.stringify([
        exclusion(),
        exclusion({ id: 'manual-1', empleado: '2001', nombreApellidos: 'Bea Ruiz', reason: 'Manual', drawId: null }),
      ]),
    );
    useSorteosStore.getState().load();
    useSorteosStore.getState().viewDraw('draw-1');

    useSorteosStore.getState().deleteDraw('draw-1', true);

    expect(useSorteosStore.getState().draws).toEqual([]);
    expect(useSorteosStore.getState().visibleDrawId).toBe('');
    expect(useSorteosStore.getState().visibleResult).toBeNull();
    expect(useSorteosStore.getState().exclusions).toEqual([
      expect.objectContaining({ id: 'manual-1', reason: 'Manual' }),
    ]);
    expect(readDraws()).toEqual([]);
    expect(readExclusions()).toHaveLength(1);
  });

  it('resetea solo exclusiones de ganadores de un sorteo y mantiene manuales', () => {
    window.localStorage.setItem(DRAWS_STORAGE_KEY, JSON.stringify([draw(), draw({ id: 'draw-2' })]));
    window.localStorage.setItem(
      EXCLUSIONS_STORAGE_KEY,
      JSON.stringify([
        exclusion(),
        exclusion({ id: 'winner-2', empleado: '1002', nombreApellidos: 'Bea Ruiz', drawId: 'draw-2' }),
        exclusion({ id: 'manual-1', empleado: '2001', nombreApellidos: 'Carlos Pérez', reason: 'Manual', drawId: null }),
      ]),
    );
    useSorteosStore.getState().load();

    useSorteosStore.getState().resetDrawWinnerExclusions('draw-1');

    expect(useSorteosStore.getState().exclusions.map((item) => item.id)).toEqual(['winner-2', 'manual-1']);
    expect(readExclusions().map((item) => item.id)).toEqual(['winner-2', 'manual-1']);
  });
});
