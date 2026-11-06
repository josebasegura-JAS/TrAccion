import type { PersistenceFeedback } from './persistenceFeedback';

/** El banner representa únicamente fallos reales de escritura que siguen pendientes. */
export function nextWriteError(
  current: PersistenceFeedback | null,
  incoming: PersistenceFeedback,
): PersistenceFeedback | null {
  if (incoming.visibility === 'silent' || incoming.category === 'conflict') return current;
  if (incoming.kind === 'error') {
    // Los fallos de lectura se notifican en el indicador, nunca como "error de guardado".
    return incoming.operation === 'read' ? current : incoming;
  }
  if (incoming.kind !== 'saved' || !current) return current;
  // La confirmación de otra clave no puede borrar un error real todavía pendiente.
  const sameKey = current.key === incoming.key;
  return sameKey ? null : current;
}

export function isConflictFeedback(feedback: PersistenceFeedback): boolean {
  return feedback.kind === 'error' && feedback.category === 'conflict';
}
