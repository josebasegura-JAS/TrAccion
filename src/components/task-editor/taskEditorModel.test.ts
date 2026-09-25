import { describe, expect, it } from 'vitest';
import { EMPTY_TASK_DRAFT, type Task } from '../../features/tareas/domain/task';
import {
  createInitialDraft,
  decodeTracking,
  encodeTracking,
  mergeDocumentLinks,
  toDraft,
} from './taskEditorModel';

describe('taskEditorModel', () => {
  it('codifica y decodifica un seguimiento conservando fecha y usuario', () => {
    const encoded = encodeTracking('Texto de prueba', '2026-09-25', 'Usuario Test', 'tracking-test');
    expect(decodeTracking(encoded, '2026-01-01')).toMatchObject({
      text: 'Texto de prueba',
      date: '2026-09-25',
      user: 'Usuario Test',
      id: 'tracking-test',
    });
  });

  it('evita duplicar documentos por la misma ruta', () => {
    const merged = mergeDocumentLinks(
      [{ id: '1', nombre: 'a.pdf', ruta: 'Z:/a.pdf', createdAt: '2026-09-25T00:00:00.000Z' }],
      [
        { id: '2', nombre: 'a.pdf', ruta: 'z:/A.pdf', createdAt: '2026-09-25T00:00:00.000Z' },
        { id: '3', nombre: 'b.pdf', ruta: 'Z:/b.pdf', createdAt: '2026-09-25T00:00:00.000Z' },
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(['1', '3']);
  });

  it('convierte una tarea existente a borrador sin perder documentos ni correo', () => {
    const task: Task = {
      id: 'task-1',
      titulo: 'Revisar calendario',
      descripcion: 'Detalle',
      tipo: 'tarea',
      fase: 'tarea',
      estado: 'pendiente',
      prioridad: 'media',
      createdAt: '2026-09-25T08:00:00.000Z',
      updatedAt: '2026-09-25T08:00:00.000Z',
      fechaLimite: '',
      responsable: 'RRLL',
      origen: 'Interno',
      sindicato: '',
      observaciones: '',
      mail: 'Contenido del correo',
      documentLinks: [{ id: 'doc-1', nombre: 'a.pdf', ruta: 'Z:/a.pdf', createdAt: '2026-09-25T08:00:00.000Z' }],
      seguimiento: [],
    };

    expect(toDraft(task)).toMatchObject({
      titulo: 'Revisar calendario',
      mail: 'Contenido del correo',
      documentLinks: task.documentLinks,
    });
  });

  it('aplica el borrador inicial sólo al crear una tarea', () => {
    const draft = createInitialDraft(null, { titulo: 'Nueva tarea', prioridad: 'alta' });
    expect(draft).toMatchObject({ ...EMPTY_TASK_DRAFT, titulo: 'Nueva tarea', prioridad: 'alta' });
  });
});
