import { describe, expect, it } from 'vitest';
import { isPersistedStorageKey } from './persistenceKeys';

describe('clasificación de persistencia', () => {
  it('mantiene como compartidos los datos operativos', () => {
    expect(isPersistedStorageKey('traccion.v1.tareas.tasks')).toBe(true);
    expect(isPersistedStorageKey('traccion.v1.paritaria.sessions')).toBe(true);
  });

  it('no sincroniza preferencias visuales locales entre usuarios', () => {
    expect(isPersistedStorageKey('traccion.v1.vinculograma.showExpired')).toBe(false);
  });

  it('no trata metadatos internos SQLite como registros de negocio', () => {
    expect(isPersistedStorageKey('traccion.v1.sqlite.hydrationMetadata')).toBe(false);
    expect(isPersistedStorageKey('traccion.v1.sqlite.pendingWrites')).toBe(false);
  });
});
