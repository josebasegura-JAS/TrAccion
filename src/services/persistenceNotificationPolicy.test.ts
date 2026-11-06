import { describe, expect, it } from 'vitest';
import { isConflictFeedback, nextWriteError } from './persistenceNotificationPolicy';
import type { PersistenceFeedback } from './persistenceFeedback';

const event = (
  kind: PersistenceFeedback['kind'],
  key: string | undefined,
  options: Partial<PersistenceFeedback> = {},
): PersistenceFeedback => ({ kind, key, message: 'Mensaje de prueba', updatedAt: '2026-11-06T07:00:00.000Z', ...options });

describe('notificaciones de persistencia', () => {
  it('mantiene el error de una clave si se guarda otra', () => {
    const failure = event('error', 'tareas', { operation: 'write' });
    expect(nextWriteError(failure, event('saved', 'loteria'))).toEqual(failure);
    expect(nextWriteError(failure, event('saved', 'tareas'))).toBeNull();
  });

  it('no borra errores identificados mediante éxitos sin clave', () => {
    const failure = event('error', 'tareas');
    expect(nextWriteError(failure, event('saved', undefined))).toEqual(failure);
  });

  it('no presenta un error de lectura como fallo de guardado', () => {
    expect(nextWriteError(null, event('error', 'tareas', { operation: 'read' }))).toBeNull();
  });

  it('ignora mensajes silenciosos y conflictos en el banner global', () => {
    const failure = event('error', 'tareas');
    expect(nextWriteError(failure, event('saved', 'tareas', { visibility: 'silent' }))).toEqual(failure);
    const conflict = event('error', 'tareas', { category: 'conflict' });
    expect(isConflictFeedback(conflict)).toBe(true);
    expect(nextWriteError(null, conflict)).toBeNull();
  });

  it('un conflicto nunca es un evento saved', () => {
    const conflict = event('error', 'tareas', { category: 'conflict' });
    expect(isConflictFeedback(conflict)).toBe(true);
    expect(conflict.kind).not.toBe('saved');
  });

  it('los errores de escritura siguen siendo visibles', () => {
    const failure = event('error', 'ticket-restaurante', { operation: 'write' });
    expect(nextWriteError(null, failure)).toEqual(failure);
  });
});
