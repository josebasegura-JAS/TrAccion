import type { SafeRestartBackupSnapshot } from './safeRestartPolicy.js';

export const UNKNOWN_BACKUP_STATE: SafeRestartBackupSnapshot = {
  activeBackupOperations: 1, queuedBackupOperations: 0, pendingBackupRevisions: 0,
};

export function isBackupSnapshot(value: unknown): value is SafeRestartBackupSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return ['activeBackupOperations', 'queuedBackupOperations', 'pendingBackupRevisions'].every(key =>
    typeof candidate[key] === 'number' && Number.isSafeInteger(candidate[key]) && Number(candidate[key]) >= 0);
}

export function backupsAreSettled(snapshot: SafeRestartBackupSnapshot | undefined): boolean {
  return !!snapshot && snapshot.activeBackupOperations === 0 &&
    snapshot.queuedBackupOperations === 0 && snapshot.pendingBackupRevisions === 0;
}

// El timeout remoto es el límite de incertidumbre del transporte. El IPC
// exterior tiene margen para el arranque (15 s) y la entrega de su respuesta.
export const SQLITE_ENGINE_REQUEST_TIMEOUT_MS = 120_000;
export const SQLITE_ENGINE_IPC_TIMEOUT_MS = 150_000;
