import { describe, expect, it } from 'vitest';
import { EMPTY_TASK_DRAFT } from '../../features/tareas/domain/task';
import {
  createInitialDraft,
  decodeTracking,
  encodeTracking,
  mergeDocumentLinks,
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

  it('aplica el borrador inicial sólo al crear una tarea', () => {
    const draft = createInitialDraft(null, { titulo: 'Nueva tarea', prioridad: 'alta' });
    expect(draft).toMatchObject({ ...EMPTY_TASK_DRAFT, titulo: 'Nueva tarea', prioridad: 'alta' });
  });
});
