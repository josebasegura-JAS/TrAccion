import { describe, expect, it } from 'vitest';
import { filterTasks, EMPTY_TASK_FILTERS } from './filters';
import { sortTasksByDefault, sortTasksByColumn } from './sort';
import { getTaskClosedYear, groupHistoricTasksByYear } from './historico';
import type { Task } from './task';

const ts = '2026-06-17T08:00:00.000Z';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    titulo: 'Tarea base',
    descripcion: '',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origen: '',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    closedAt: null,
    ...overrides,
  };
}

// ─── filterTasks ──────────────────────────────────────────────────────────────

describe('filterTasks', () => {
  it('sin filtros activos excluye borradas y cerradas', () => {
    const tasks = [
      task({ id: 'ok' }),
      task({ id: 'borrada', deletedAt: ts }),
      task({ id: 'cerrada-estado', estado: 'cerrada' }),
      task({ id: 'cerrada-fase', fase: 'cerrada' }),
    ];
    expect(filterTasks(tasks, EMPTY_TASK_FILTERS).map((t) => t.id)).toEqual(['ok']);
  });

  it('búsqueda case-insensitive en título, descripción, sindicato y origen', () => {
    const tasks = [
      task({ id: 'a', titulo: 'Calendario laboral' }),
      task({ id: 'b', descripcion: 'sobre el calendario' }),
      task({ id: 'c', titulo: 'Irrelevante' }),
    ];
    expect(
      filterTasks(tasks, { ...EMPTY_TASK_FILTERS, search: 'CALENDARIO' }).map((t) => t.id),
    ).toEqual(['a', 'b']);
  });

  it('trim en la búsqueda: espacios alrededor no bloquean resultados', () => {
    const tasks = [task({ id: 'x', titulo: 'Permiso Retribuido' })];
    expect(filterTasks(tasks, { ...EMPTY_TASK_FILTERS, search: '  permiso  ' })).toHaveLength(1);
  });

  it('filtra por tipo, fase, estado, prioridad y sindicato simultáneamente', () => {
    const tasks = [
      task({
        id: 'match',
        tipo: 'sindical',
        fase: 'peticion',
        estado: 'en curso',
        prioridad: 'alta',
        sindicato: 'LAB',
      }),
      task({ id: 'no-tipo', tipo: 'interna' }),
    ];
    const filters = {
      ...EMPTY_TASK_FILTERS,
      tipo: 'sindical' as const,
      fase: 'peticion',
      estado: 'en curso' as const,
      prioridad: 'alta' as const,
      origen: 'LAB',
    };
    expect(filterTasks(tasks, filters).map((t) => t.id)).toEqual(['match']);
  });

  it('búsqueda vacía devuelve todas las tareas activas', () => {
    const tasks = [task({ id: '1' }), task({ id: '2', titulo: 'Otra tarea' })];
    expect(filterTasks(tasks, EMPTY_TASK_FILTERS)).toHaveLength(2);
  });
});

// ─── sortTasksByDefault ───────────────────────────────────────────────────────

describe('sortTasksByDefault', () => {
  it('ordena por prioridad: critica > alta > media > baja', () => {
    const tasks = [
      task({ id: 'b', prioridad: 'baja' }),
      task({ id: 'c', prioridad: 'critica' }),
      task({ id: 'm', prioridad: 'media' }),
      task({ id: 'a', prioridad: 'alta' }),
    ];
    expect(sortTasksByDefault(tasks).map((t) => t.id)).toEqual(['c', 'a', 'm', 'b']);
  });

  it('dentro de la misma prioridad: fecha límite asc, sin fecha al final', () => {
    const tasks = [
      task({ id: 'sin', prioridad: 'alta', fechaLimite: '' }),
      task({ id: 'tarde', prioridad: 'alta', fechaLimite: '2026-12-01' }),
      task({ id: 'pronto', prioridad: 'alta', fechaLimite: '2026-07-01' }),
    ];
    expect(sortTasksByDefault(tasks).map((t) => t.id)).toEqual(['pronto', 'tarde', 'sin']);
  });

  it('estable: preserva el orden de inserción entre elementos iguales', () => {
    const tasks = [
      task({ id: '1', prioridad: 'media', fechaLimite: '' }),
      task({ id: '2', prioridad: 'media', fechaLimite: '' }),
      task({ id: '3', prioridad: 'media', fechaLimite: '' }),
    ];
    expect(sortTasksByDefault(tasks).map((t) => t.id)).toEqual(['1', '2', '3']);
  });
});

// ─── sortTasksByColumn ────────────────────────────────────────────────────────

describe('sortTasksByColumn', () => {
  it('ordena por titulo asc y desc', () => {
    const tasks = [
      task({ id: 'z', titulo: 'Zzz' }),
      task({ id: 'a', titulo: 'Aaa' }),
      task({ id: 'm', titulo: 'Mmm' }),
    ];
    expect(sortTasksByColumn(tasks, 'titulo', 'asc').map((t) => t.id)).toEqual(['a', 'm', 'z']);
    expect(sortTasksByColumn(tasks, 'titulo', 'desc').map((t) => t.id)).toEqual(['z', 'm', 'a']);
  });

  it('fechaLimite asc: vacíos siempre al final', () => {
    const tasks = [
      task({ id: 'sin', fechaLimite: '' }),
      task({ id: 'jul', fechaLimite: '2026-07-01' }),
      task({ id: 'ene', fechaLimite: '2026-01-15' }),
    ];
    const sorted = sortTasksByColumn(tasks, 'fechaLimite', 'asc');
    expect(sorted.map((t) => t.id)).toEqual(['ene', 'jul', 'sin']);
  });

  it('prioridad: orden de catálogo (critica primero en asc)', () => {
    const tasks = [
      task({ id: 'b', prioridad: 'baja' }),
      task({ id: 'c', prioridad: 'critica' }),
      task({ id: 'a', prioridad: 'alta' }),
    ];
    expect(sortTasksByColumn(tasks, 'prioridad', 'asc').map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});

// ─── historico ────────────────────────────────────────────────────────────────

describe('groupHistoricTasksByYear', () => {
  it('agrupa por año y ordena de más reciente a más antigua', () => {
    const tasks = [
      task({ id: 'a', estado: 'cerrada', closedAt: '2024-03-01T00:00:00.000Z' }),
      task({ id: 'b', estado: 'cerrada', closedAt: '2026-01-15T00:00:00.000Z' }),
      task({ id: 'c', estado: 'cerrada', closedAt: '2024-11-20T00:00:00.000Z' }),
    ];
    const groups = groupHistoricTasksByYear(tasks);
    expect(groups.map((g) => g.year)).toEqual(['2026', '2024']);
    expect(groups[1].tasks.map((t) => t.id)).toContain('a');
    expect(groups[1].tasks.map((t) => t.id)).toContain('c');
  });

  it('ignora tareas no cerradas', () => {
    const tasks = [
      task({ id: 'open', estado: 'pendiente', closedAt: null }),
      task({ id: 'closed', estado: 'cerrada', closedAt: '2026-01-01T00:00:00.000Z' }),
    ];
    const groups = groupHistoricTasksByYear(tasks);
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['closed']);
  });

  it('closedAt null → grupo "Sin fecha"', () => {
    const groups = groupHistoricTasksByYear([task({ estado: 'cerrada', closedAt: null })]);
    expect(groups[0].year).toBe('Sin fecha');
  });

  it('closedAt con fecha inválida → grupo "Sin fecha"', () => {
    const groups = groupHistoricTasksByYear([task({ estado: 'cerrada', closedAt: 'no-es-fecha' })]);
    expect(groups[0].year).toBe('Sin fecha');
  });
});

describe('getTaskClosedYear', () => {
  it('extrae el año de una fecha ISO válida', () => {
    expect(getTaskClosedYear(task({ closedAt: '2025-12-31T23:59:59.000Z' }))).toBe('2025');
  });

  it('devuelve "Sin fecha" para null', () => {
    expect(getTaskClosedYear(task({ closedAt: null }))).toBe('Sin fecha');
  });
});
