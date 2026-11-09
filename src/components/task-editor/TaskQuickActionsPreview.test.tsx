import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Task } from '../../features/tareas/domain/task';
import { TaskQuickActionsPreview } from './TaskQuickActionsPreview';
import { getTaskQuickActions } from './taskQuickActions';

const fixture = {
  id: 'task-123',
  titulo: 'Preparar reunión',
  seguimiento: [
    { fechaHora: '2026-11-09T10:00:00Z', texto: 'Actuaciones', quickActions: [
      { id: 'done', titulo: 'Preparar orden del día', createdAt: '2026-11-09T10:00:00Z', completedAt: '2026-11-09T11:00:00Z' },
      { id: 'pending', titulo: 'Enviar convocatoria', asignadaA: 'Administración', fechaObjetivo: '2026-11-16', createdAt: '2026-11-09T10:00:00Z' },
    ] },
    { fechaHora: '2026-11-08T10:00:00Z', texto: 'Antecedentes' },
  ],
} as Task;

describe('Vista desplegada de acciones de Tareas', () => {
  it('incluye acciones de todos los seguimientos y ordena pendientes antes de completadas', () => {
    expect(getTaskQuickActions(fixture).map((action) => action.id)).toEqual(['pending', 'done']);
  });

  it('muestra título, responsable, fecha y ambos estados sin controles de edición', () => {
    const html = renderToStaticMarkup(<TaskQuickActionsPreview task={fixture} />);
    expect(html).toContain('1 pendientes · 1 completadas');
    expect(html).toContain('Enviar convocatoria');
    expect(html).toContain('Administración');
    expect(html).toContain('2026-11-16');
    expect(html).toContain('Preparar orden del día');
    expect(html).toContain('Solo consulta');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<button');
  });

  it('no inventa acciones en tareas sin seguimientos', () => {
    expect(getTaskQuickActions({ ...fixture, seguimiento: [] })).toEqual([]);
  });
});
