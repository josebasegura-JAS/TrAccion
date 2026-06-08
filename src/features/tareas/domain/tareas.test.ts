import { describe, expect, it } from 'vitest';
import { EMPTY_TASK_FILTERS, filterTasks, type TaskFilters } from './filters';
import { groupHistoricTasksByYear } from './historico';
import { sortTasksByDefault } from './sort';
import { migratePeticionToTask, type Task } from './task';

function buildTask(overrides: Partial<Task>): Task {
  return {
    id: 'task-base',
    titulo: 'Título base',
    descripcion: 'Descripción base',
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
    seguimiento: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    closedAt: null,
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

  it('permite tareas de tipo interna', () => {
    const source = [buildTask({ id: 'interna', tipo: 'interna' })];

    expect(filterTasks(source, { ...EMPTY_TASK_FILTERS, tipo: 'interna' }).map((task) => task.id)).toEqual([
      'interna',
    ]);
  });

  it('permite tareas de tipo sindical', () => {
    const source = [buildTask({ id: 'sindical', tipo: 'sindical', sindicato: 'UGT' })];

    expect(filterTasks(source, { ...EMPTY_TASK_FILTERS, tipo: 'sindical' }).map((task) => task.id)).toEqual([
      'sindical',
    ]);
  });

  it('filtra por fase configurable', () => {
    const source = [
      buildTask({ id: 'comite', fase: 'comite' }),
      buildTask({ id: 'paritaria', fase: 'paritaria' }),
    ];

    expect(filterTasks(source, { ...EMPTY_TASK_FILTERS, fase: 'paritaria' }).map((task) => task.id)).toEqual([
      'paritaria',
    ]);
  });

  it('filtra por tipo, fase, estado y prioridad', () => {
    const source = [
      buildTask({ id: 'match', tipo: 'sindical', fase: 'peticion', estado: 'bloqueada', prioridad: 'alta' }),
      buildTask({ id: 'otro-tipo', tipo: 'interna', fase: 'peticion', estado: 'bloqueada', prioridad: 'alta' }),
      buildTask({ id: 'otra-fase', tipo: 'sindical', fase: 'comite', estado: 'bloqueada', prioridad: 'alta' }),
      buildTask({ id: 'otro-estado', tipo: 'sindical', fase: 'peticion', estado: 'resuelta', prioridad: 'alta' }),
      buildTask({ id: 'otra-prioridad', tipo: 'sindical', fase: 'peticion', estado: 'bloqueada', prioridad: 'baja' }),
    ];
    const filters: TaskFilters = {
      ...EMPTY_TASK_FILTERS,
      tipo: 'sindical',
      fase: 'peticion',
      estado: 'bloqueada',
      prioridad: 'alta',
    };

    expect(filterTasks(source, filters).map((task) => task.id)).toEqual(['match']);
  });

  it('busca por título, descripción, sindicato y origen', () => {
    const source = [
      buildTask({ id: 'titulo', titulo: 'Revisar acta' }),
      buildTask({ id: 'descripcion', descripcion: 'Seguimiento de acta sindical' }),
      buildTask({ id: 'sindicato', sindicato: 'Acta sindicato' }),
      buildTask({ id: 'origen', origen: 'Acta origen' }),
      buildTask({ id: 'sin-coincidencia', responsable: 'Acta responsable' }),
    ];

    expect(filterTasks(source, { ...EMPTY_TASK_FILTERS, search: 'acta' }).map((task) => task.id)).toEqual([
      'titulo',
      'descripcion',
      'sindicato',
      'origen',
    ]);
  });

  it('excluye cerradas por estado de la vista activa', () => {
    const source = [
      buildTask({ id: 'visible' }),
      buildTask({ id: 'cerrada-estado', estado: 'cerrada', closedAt: '2026-01-03T00:00:00.000Z' }),
    ];

    expect(filterTasks(source, EMPTY_TASK_FILTERS).map((task) => task.id)).toEqual(['visible']);
  });

  it('excluye cerradas por fase de la vista activa', () => {
    const source = [buildTask({ id: 'visible' }), buildTask({ id: 'cerrada-fase', fase: 'cerrada' })];

    expect(filterTasks(source, EMPTY_TASK_FILTERS).map((task) => task.id)).toEqual(['visible']);
  });

  it('agrupa el histórico por año con tareas internas y sindicales cerradas', () => {
    const source = [
      buildTask({ id: 'interna-2026', tipo: 'interna', estado: 'cerrada', closedAt: '2026-02-01T00:00:00.000Z' }),
      buildTask({ id: 'sindical-2025', tipo: 'sindical', fase: 'cerrada', closedAt: '2025-02-01T00:00:00.000Z' }),
      buildTask({ id: 'activa', tipo: 'sindical', fase: 'peticion' }),
    ];

    expect(groupHistoricTasksByYear(source)).toEqual([
      { year: '2026', tasks: [source[0]] },
      { year: '2025', tasks: [source[1]] },
    ]);
  });

  it('migra una petición antigua a tarea sindical en fase petición manteniendo seguimiento', () => {
    const task = migratePeticionToTask({
      id: 'peticion-1',
      titulo: 'Solicitud sindical',
      descripcion: 'Detalle',
      estado: 'cerrada',
      prioridad: 'alta',
      fechaLimite: '2026-03-01',
      solicitante: 'Delegado',
      sindicato: 'CCOO',
      observaciones: 'Obs',
      seguimiento: [{ fechaHora: '2026-02-01T00:00:00.000Z', texto: 'Entrada' }],
      closedAt: '2026-04-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(task).toMatchObject({
      id: 'migrada-peticion-1',
      tipo: 'sindical',
      fase: 'peticion',
      origen: 'Delegado',
      sindicato: 'CCOO',
      seguimiento: [{ fechaHora: '2026-02-01T00:00:00.000Z', texto: 'Entrada' }],
    });
  });
});
