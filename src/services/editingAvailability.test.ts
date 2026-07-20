import { describe, expect, it } from 'vitest';
import { deriveEditingAvailability } from './editingAvailability';

const activeStatus = {
  ready: true,
  phase: 'active',
  message: 'SQLite activa',
} as TraccionDatabaseStatus;

describe('editingAvailability', () => {
  it('permite editar únicamente con IPC y SQLite activa', () => {
    expect(deriveEditingAvailability({
      status: activeStatus,
      hasPersistenceIpc: true,
      connectivityBlocked: false,
    }).allowed).toBe(true);
  });

  it.each(['fallback', 'locked', 'error'] as const)(
    'bloquea la edición cuando SQLite está en fase %s',
    (phase) => {
      const result = deriveEditingAvailability({
        status: { ...activeStatus, ready: false, phase } as TraccionDatabaseStatus,
        hasPersistenceIpc: true,
        connectivityBlocked: false,
      });
      expect(result.allowed).toBe(false);
    },
  );

  it('bloquea cuando el estado SQLite todavía es desconocido', () => {
    const result = deriveEditingAvailability({
      status: null,
      hasPersistenceIpc: true,
      connectivityBlocked: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Comprobando');
  });

  it('bloquea inmediatamente si se pierde la conectividad aunque SQLite figurase activa', () => {
    const result = deriveEditingAvailability({
      status: activeStatus,
      hasPersistenceIpc: true,
      connectivityBlocked: true,
      connectivityMessage: 'Carpeta compartida no accesible.',
    });
    expect(result.allowed).toBe(false);
    expect(result.connectivityBlocked).toBe(true);
    expect(result.reason).toBe('Carpeta compartida no accesible.');
  });

  it('bloquea la edición si falta el IPC de persistencia', () => {
    const result = deriveEditingAvailability({
      status: activeStatus,
      hasPersistenceIpc: false,
      connectivityBlocked: false,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('IPC');
  });
});
