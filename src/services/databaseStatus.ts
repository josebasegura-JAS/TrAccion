import { useEffect, useState } from 'react';

let cachedDatabaseStatus: TraccionDatabaseStatus | null = null;
let pendingDatabaseStatusRequest: Promise<TraccionDatabaseStatus | null> | null = null;
const databaseStatusListeners = new Set<() => void>();

function notifyDatabaseStatusListeners(): void {
  databaseStatusListeners.forEach((listener) => listener());
}

export function getCachedDatabaseStatus(): TraccionDatabaseStatus | null {
  return cachedDatabaseStatus;
}

export function publishDatabaseStatus(status: TraccionDatabaseStatus | null): void {
  cachedDatabaseStatus = status;
  notifyDatabaseStatusListeners();
}

export function subscribeDatabaseStatus(listener: () => void): () => void {
  databaseStatusListeners.add(listener);
  return () => databaseStatusListeners.delete(listener);
}

export async function refreshDatabaseStatus(): Promise<TraccionDatabaseStatus | null> {
  if (!window.traccion?.databaseStatus) {
    publishDatabaseStatus(null);
    return null;
  }

  if (!pendingDatabaseStatusRequest) {
    pendingDatabaseStatusRequest = window.traccion
      .databaseStatus()
      .then((status) => {
        publishDatabaseStatus(status);
        return status;
      })
      .catch((error: unknown) => {
        console.warn('No se ha podido leer el estado de SQLite.', error);
        publishDatabaseStatus(null);
        return null;
      })
      .finally(() => {
        pendingDatabaseStatusRequest = null;
      });
  }

  return pendingDatabaseStatusRequest;
}

export function useDatabaseStatus(): TraccionDatabaseStatus | null {
  const [databaseStatus, setDatabaseStatus] = useState(getCachedDatabaseStatus);

  useEffect(() => {
    const unsubscribe = subscribeDatabaseStatus(() => {
      setDatabaseStatus(getCachedDatabaseStatus());
    });

    if (!getCachedDatabaseStatus()) {
      void refreshDatabaseStatus();
    }

    return unsubscribe;
  }, []);

  return databaseStatus;
}
