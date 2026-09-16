import { useEffect, useState } from 'react';

let cachedDatabaseStatus: TraccionDatabaseStatus | null = null;
let pendingDatabaseStatusRequest: Promise<TraccionDatabaseStatus | null> | null = null;
const databaseStatusListeners = new Set<() => void>();

function notifyDatabaseStatusListeners(): void {
  databaseStatusListeners.forEach((listener) => listener());
}

function pointToDatabaseSettingsWhenLocked(status: TraccionDatabaseStatus | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  const isLocked = status?.phase === 'locked' || status?.phase === 'fallback';
  if (!isLocked || window.location.hash === '#base-de-datos') {
    return;
  }

  // No navegamos de módulo aquí: únicamente dejamos preparado el ancla.
  // Cuando el usuario pulse "Ver bloqueo en Ajustes", AjustesPage se monta
  // con esta hash y abre automáticamente el bloque avanzado de Base de datos.
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}#base-de-datos`,
  );
}

export function getCachedDatabaseStatus(): TraccionDatabaseStatus | null {
  return cachedDatabaseStatus;
}

export function publishDatabaseStatus(status: TraccionDatabaseStatus | null): void {
  cachedDatabaseStatus = status;
  pointToDatabaseSettingsWhenLocked(status);
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
