import { describe, expect, it } from 'vitest';
import { EMPTY_TASK_FILTERS, filterTasks, type TaskFilters } from './filters';
import { sortTasksByDefault } from './sort';
import type { Task } from './task';

function buildTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-base',
    titulo: 'Título base',
    descripcion: 'Descripción base',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: '',
    origenSindicato: '',
    observaciones: '',
    actualizaciones: [],
    closedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const tasks: Task[] = [
  buildTask({ id: 'baja-con-fecha', prioridad: 'baja', fechaLimite: '2026-01-02' }),
  buildTask({ id: 'critica-sin-fecha', prioridad: 'critica', fechaLimite: '' }),
  buildTask({ id: 'alta-tarde', prioridad: 'alta', fechaLimite: '2026-01-10' }),
  buildTask({ id: 'critica-temprana', prioridad: 'critica', fechaLimite: '2026-01-01' }),
  buildTask({ id: 'alta-temprana', prioridad: 'alta', fechaLimite: '2026-01-03' }),
  buildTask({ id: 'media', prioridad: 'media', fechaLimite: '2026-01-04' }),
];

describe('tareas domain', () => {
  it('ordena por prioridad y fecha límite, dejando sin fecha al final de su prioridad', () => {
    expect(sortTasksByDefault(tasks).map((task) => task.id)).toEqual([
      'critica-temprana',
      'critica-sin-fecha',
      'alta-temprana',
      'alta-tarde',
      'media',
      'baja-con-fecha',
    ]);
  });

  it('busca únicamente por título y descripción', () => {
    const source = [
      buildTask({ id: 'titulo', titulo: 'Revisar acta', responsable: 'No coincide' }),
      buildTask({ id: 'descripcion', descripcion: 'Seguimiento de acta sindical' }),
      buildTask({ id: 'responsable', titulo: 'Otra tarea', descripcion: '', responsable: 'Acta' }),
    ];

    expect(filterTasks(source, { ...EMPTY_TASK_FILTERS, search: 'acta' }).map((task) => task.id)).toEqual([
      'titulo',
      'descripcion',
    ]);
  });

  it('filtra por estado y prioridad', () => {
    const source = [
      buildTask({ id: 'pendiente-alta', estado: 'pendiente', prioridad: 'alta' }),
      buildTask({ id: 'curso-alta', estado: 'en curso', prioridad: 'alta' }),
      buildTask({ id: 'curso-baja', estado: 'en curso', prioridad: 'baja' }),
    ];
    const filters: TaskFilters = { ...EMPTY_TASK_FILTERS, estado: 'en curso', prioridad: 'alta' };

    expect(filterTasks(source, filters).map((task) => task.id)).toEqual(['curso-alta']);
  });

  it('excluye tareas borradas y cerradas de la vista activa', () => {
    const source = [
      buildTask({ id: 'visible' }),
      buildTask({ id: 'borrada', deletedAt: '2026-01-02T00:00:00.000Z' }),
      buildTask({ id: 'cerrada', estado: 'cerrada', closedAt: '2026-01-03T00:00:00.000Z' }),
    ];

    expect(filterTasks(source, EMPTY_TASK_FILTERS).map((task) => task.id)).toEqual(['visible']);
  });
});
