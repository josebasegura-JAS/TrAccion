/**
 * Small fail-closed admission rule for the experimental supervised writer.
 * Legacy, non-receipted operations are only allowed in the isolated
 * development protocol, never after opening a generation-bound session.
 */
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';

export function assertSupervisedWriterRequestAllowed(
  kind: DetachedWriterRequest['kind'],
  activeGeneration: number | null,
): void {
  if (activeGeneration !== null && !kind.endsWith('-receipted')) {
    throw new Error('Sesión SQLite supervisada: escritura sin recibo transaccional prohibida.');
  }
}
