import { describe, expect, it } from 'vitest';
import { applySessionMutationPatch } from './createSessionStore';
import type { ManagedSession } from './session';

function session(id: string, title: string, status: 'open' | 'closed' = 'open'): ManagedSession {
  return {
    id,
    code: id,
    title,
    status,
    date: '2026-11-03',
    notes: '',
    observations: '',
    items: [],
    treatedTaskIds: [],
    untreatedTaskIds: [],
    createdAt: '2026-11-03T10:00:00.000Z',
    updatedAt: '2026-11-03T10:00:00.000Z',
    closedAt: status === 'closed' ? '2026-11-03T10:00:00.000Z' : null,
  };
}

describe('parche granular de Comité y Paritaria', () => {
  it('actualiza solo la sesión editada y mantiene otras sesiones visibles', () => {
    const first = session('comite-1', 'Primera');
    const second = session('comite-2', 'Segunda');
    const changed = session('comite-1', 'Primera editada');
    expect(applySessionMutationPatch([first, second], {
      records: [changed],
      patch: { upsert: changed },
    })).toEqual([changed, second]);
  });

  it('la creación incorpora una sesión sin borrar las existentes', () => {
    const existing = session('paritaria-1', 'Existente');
    const created = session('paritaria-2', 'Nueva');
    expect(applySessionMutationPatch([existing], {
      records: [created],
      patch: { upsert: created },
    })).toEqual([existing, created]);
  });

  it('elimina únicamente la sesión solicitada', () => {
    const a = session('comite-1', 'A');
    const b = session('comite-2', 'B');
    expect(applySessionMutationPatch([a, b], {
      records: [],
      patch: { removedId: a.id },
    })).toEqual([b]);
  });

  it('mantiene el comportamiento de lectura completa en rutas legacy e importaciones', () => {
    const a = session('comite-1', 'A');
    const b = session('comite-2', 'B');
    expect(applySessionMutationPatch([a], { records: [b] })).toEqual([b]);
  });

  it('permite actualizar una sesión cerrada sin eliminar otras sesiones históricas visibles', () => {
    const a = session('paritaria-1', 'Cerrada', 'closed');
    const b = session('paritaria-2', 'Otra cerrada', 'closed');
    const reopened = session('paritaria-1', 'Reabierta');
    expect(applySessionMutationPatch([a, b], {
      records: [reopened],
      patch: { upsert: reopened },
    })).toEqual([reopened, b]);
  });
});
