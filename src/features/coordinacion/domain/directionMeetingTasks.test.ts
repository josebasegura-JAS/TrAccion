import { describe, expect, it } from 'vitest';
import type { Task } from '../../tareas/domain/task';
import { directionMeetingTasks } from './directionMeetingTasks';

const task = (id: string, estado: string, fase = 'tarea'): Task => ({
  id, titulo: id, descripcion: '', estado, fase, deletedAt: null,
} as Task);

describe('directionMeetingTasks', () => {
  it('incorpora tareas abiertas Tratar con Rosa por estado o fase', () => {
    const tasks = [task('estado', 'Tratar con Rosa'), task('fase', 'pendiente', 'Tratar con Rosa'), task('normal', 'pendiente')];
    expect(directionMeetingTasks(tasks, []).map((item) => item.id)).toEqual(['estado', 'fase']);
  });

  it('incorpora tareas marcadas y no duplica identificadores', () => {
    const tasks = [task('rosa', 'Tratar con Rosa'), task('rosa', 'Tratar con Rosa'), task('marcada', 'pendiente')];
    expect(directionMeetingTasks(tasks, ['rosa', 'marcada']).map((item) => item.id)).toEqual(['rosa', 'marcada']);
  });

  it('excluye cerradas y eliminadas', () => {
    const closed = task('cerrada', 'cerrada');
    const deleted = { ...task('borrada', 'Tratar con Rosa'), deletedAt: '2026-10-13T00:00:00.000Z' };
    expect(directionMeetingTasks([closed, deleted], ['cerrada', 'borrada'])).toEqual([]);
  });

  it('genera puntos automáticamente sin marcarlos previamente para Dirección', () => {
    const available = [task('rosa-fase', 'pendiente', 'Tratar con Rosa'), task('rosa-estado', 'Tratar con Rosa'), task('otra', 'pendiente')];
    const pointTaskIds = directionMeetingTasks(available, []).map((item) => item.id);
    expect(pointTaskIds).toEqual(['rosa-fase', 'rosa-estado']);
  });

  it('normaliza mayúsculas y acentos', () => {
    expect(directionMeetingTasks([task('rosa', ' TRATAR CON ROSA ')], [])).toHaveLength(1);
  });
});
