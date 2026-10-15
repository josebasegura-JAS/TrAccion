import { describe, expect, it } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { buildTaskCatalogRenameWarning, countTaskCatalogReferences } from './taskCatalogIntegrity';

function task(overrides: Partial<Task>): Task {
  return {
    id: 'task-1',
    titulo: 'Tarea',
    descripcion: '',
    tipo: 'interna',
    fase: 'tarea',
    estado: 'pendiente',
    prioridad: 'media',
    fechaLimite: '',
    responsable: 'jasegura',
    origen: 'Dirección',
    sindicato: '',
    observaciones: '',
    mail: '',
    documentLinks: [],
    sessionDocumentCode: '',
    sessionModule: '',
    sessionDate: '',
    seguimiento: [],
    createdAt: '2026-10-15T08:00:00.000Z',
    updatedAt: '2026-10-15T08:00:00.000Z',
    deletedAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe('taskCatalogIntegrity', () => {
  it('cuenta referencias activas e históricas por el texto realmente almacenado', () => {
    const tasks = [
      task({ id: 'active', fase: 'revisión' }),
      task({ id: 'closed', fase: 'revisión', estado: 'cerrada', closedAt: '2026-10-14T12:00:00.000Z' }),
      task({ id: 'other', fase: 'tarea' }),
      task({ id: 'deleted', fase: 'revisión', deletedAt: '2026-10-14T12:00:00.000Z' }),
    ];

    expect(countTaskCatalogReferences(tasks, 'fase', 'revisión')).toBe(2);
    expect(countTaskCatalogReferences(tasks, 'fase', 'nueva fase')).toBe(0);
  });

  it.each([
    ['estado', { estado: 'en curso' }],
    ['fase', { fase: 'comunicación' }],
    ['responsable', { responsable: 'Rosa' }],
    ['origen', { origen: 'Dirección' }],
  ] as const)('detecta referencias del catálogo %s', (field, overrides) => {
    expect(countTaskCatalogReferences([task(overrides)], field, Object.values(overrides)[0])).toBe(1);
  });

  it('advierte que renombrar el catálogo no migra las tareas existentes', () => {
    const warning = buildTaskCatalogRenameWarning('fase', 'revisión', 'seguimiento', 3);

    expect(warning).toContain('3 tareas conservan todavía la fase «revisión»');
    expect(warning).toContain('mantendrán el valor anterior');
    expect(warning).toContain('No se migrarán automáticamente');
    expect(warning).toContain('filtros o automatismos');
  });

  it('no muestra advertencia si el valor no tiene usos', () => {
    expect(buildTaskCatalogRenameWarning('origen', 'Dirección', 'Gerencia', 0)).toBeNull();
  });
});
