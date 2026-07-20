import { useEffect, useState } from 'react';
import {
  getCachedDatabaseStatus,
  subscribeDatabaseStatus,
} from './databaseStatus';

export interface EditingAvailability {
  allowed: boolean;
  reason: string;
  connectivityBlocked: boolean;
}

let connectivityBlocked = false;
let connectivityMessage: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function publishDatabaseConnectivityBlock(blocked: boolean, message?: string): void {
  const nextMessage = message?.trim() || null;
  if (connectivityBlocked === blocked && connectivityMessage === nextMessage) {
    return;
  }

  connectivityBlocked = blocked;
  connectivityMessage = nextMessage;
  notify();
}

export function resetDatabaseConnectivityBlock(): void {
  publishDatabaseConnectivityBlock(false);
}

export function deriveEditingAvailability(options: {
  status: TraccionDatabaseStatus | null;
  hasPersistenceIpc: boolean;
  connectivityBlocked: boolean;
  connectivityMessage?: string | null;
  testMode?: boolean;
}): EditingAvailability {
  if (options.testMode) {
    return { allowed: true, reason: '', connectivityBlocked: false };
  }

  if (!options.hasPersistenceIpc) {
    return {
      allowed: false,
      reason: 'IPC de persistencia no disponible.',
      connectivityBlocked: options.connectivityBlocked,
    };
  }

  if (options.connectivityBlocked) {
    return {
      allowed: false,
      reason: options.connectivityMessage?.trim() || 'La conexión con la base compartida está en recuperación.',
      connectivityBlocked: true,
    };
  }

  if (!options.status) {
    return {
      allowed: false,
      reason: 'Comprobando la conexión con SQLite.',
      connectivityBlocked: false,
    };
  }

  if (!options.status.ready || options.status.phase !== 'active') {
    return {
      allowed: false,
      reason: options.status.message ?? 'SQLite no está activa.',
      connectivityBlocked: false,
    };
  }

  return { allowed: true, reason: '', connectivityBlocked: false };
}

export function getEditingAvailability(): EditingAvailability {
  return deriveEditingAvailability({
    status: getCachedDatabaseStatus(),
    hasPersistenceIpc: Boolean(window.traccion),
    connectivityBlocked,
    connectivityMessage,
    testMode: import.meta.env.MODE === 'test',
  });
}

export function subscribeEditingAvailability(listener: () => void): () => void {
  listeners.add(listener);
  const unsubscribeDatabaseStatus = subscribeDatabaseStatus(listener);
  return () => {
    listeners.delete(listener);
    unsubscribeDatabaseStatus();
  };
}

export function useEditingAvailability(): EditingAvailability {
  const [availability, setAvailability] = useState(getEditingAvailability);

  useEffect(() => subscribeEditingAvailability(() => {
    setAvailability(getEditingAvailability());
  }), []);

  return availability;
}
