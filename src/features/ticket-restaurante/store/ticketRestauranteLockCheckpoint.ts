import { SHARED_MODULE_LOCK_RECORD_ID } from '../../../services/sharedModuleLock';

const TICKET_RESTAURANTE_LOCK_PAYLOAD: TraccionRecordLockPayload = {
  module: 'ticket-restaurante',
  recordId: SHARED_MODULE_LOCK_RECORD_ID,
};

function formatOwner(lock: TraccionRecordLockOwnerInfo | null): string {
  return lock ? `${lock.ownerName}@${lock.machineName}` : 'otro usuario';
}

/**
 * Verifica de forma viva que el proceso sigue siendo propietario del lock de
 * Ticket Restaurante justo antes de un commit/batch compuesto. El heartbeat
 * periódico detecta pérdidas, pero puede resolver después de que una operación
 * larga haya empezado; este checkpoint evita iniciar el siguiente IPC de
 * escritura con un lock ya perdido o expirado.
 */
export async function assertTicketRestauranteModuleLockActive(): Promise<void> {
  const heartbeat = window.traccion?.heartbeatRecordLock;
  if (!heartbeat) {
    if (import.meta.env.MODE === 'test') return;
    throw new Error(
      'No se puede verificar el bloqueo compartido de Ticket Restaurante antes de guardar.',
    );
  }

  const result = await heartbeat(TICKET_RESTAURANTE_LOCK_PAYLOAD);
  if (result.status === 'acquired') return;

  throw new Error(
    result.status === 'locked'
      ? `Se ha perdido el bloqueo de Ticket Restaurante: ahora lo tiene ${formatOwner(result.lock)}.`
      : result.message || 'Se ha perdido el bloqueo compartido de Ticket Restaurante.',
  );
}
