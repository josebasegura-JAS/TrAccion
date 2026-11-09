import { describe, expect, it } from 'vitest';
import { EMPTY_TASK_DRAFT } from '../domain/task';
import { buildImportedTaskRecord } from './taskCrud';
import { buildUpdatedTask } from './taskMutations';
import { normalizeTask } from './taskNormalization';

describe('importaciones históricas y reaperturas', () => {
  it('incorpora como cerrada una sesión anterior a 2026 incluso si el borrador original estaba abierto', () => {
    const imported = buildImportedTaskRecord({
      externalKey: 'comite:2025-09:1',
      draft: { ...EMPTY_TASK_DRAFT, estado: 'pendiente', fase: 'comite' },
      closedAt: '2025-09-10T12:00:00.000Z',
    }, '2026-11-09T12:00:00.000Z');

    expect(imported.estado).toBe('cerrada');
    expect(imported.fase).toBe('cerrada');
    expect(imported.closedAt).toBe('2025-09-10T12:00:00.000Z');
  });

  it('no vuelve a cerrar una importación histórica después de una reapertura confirmada', () => {
    const imported = buildImportedTaskRecord({
      externalKey: 'paritaria:2025-09:1',
      draft: { ...EMPTY_TASK_DRAFT, estado: 'cerrada', fase: 'cerrada' },
      closedAt: '2025-09-10T12:00:00.000Z',
    }, '2026-11-09T12:00:00.000Z');

    const reopened = buildUpdatedTask(
      imported,
      {
        ...EMPTY_TASK_DRAFT,
        titulo: imported.titulo,
        origen: 'Comisión Paritaria',
        observaciones: imported.observaciones,
        estado: 'pendiente',
        fase: 'tarea',
      },
      undefined,
      undefined,
      { now: '2026-11-09T12:10:00.000Z', skipAudit: true },
    );

    expect(normalizeTask(reopened)).toMatchObject({
      estado: 'pendiente',
      fase: 'tarea',
      closedAt: null,
      updatedAt: '2026-11-09T12:10:00.000Z',
    });
  });
});
