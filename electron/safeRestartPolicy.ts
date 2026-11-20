/**
 * Control conservador de reinicio por caída prolongada de SQLite.
 * Solo observa estado local; no libera locks ni cancela E/S.
 */
export interface SafeRestartQueueSnapshot {
  runningOperation: string | null;
  queuedOperations: number;
  timedOut: boolean;
}
export interface SafeRestartBackupSnapshot {
  activeBackupOperations: number;
  queuedBackupOperations: number;
  pendingBackupRevisions: number;
}
export interface SafeRestartSafetyResult {
  ok: boolean;
  message: string;
}
export const AUTOMATIC_RESTART_AFTER_MS = 5 * 60_000;
export const AUTOMATIC_RESTART_COOLDOWN_MS = 30 * 60_000;

export function assessSafeRestart(
  queue: SafeRestartQueueSnapshot,
  backups: SafeRestartBackupSnapshot,
  unresolvedWrites: number,
): SafeRestartSafetyResult {
  if (queue.runningOperation !== null || queue.queuedOperations !== 0 || queue.timedOut) {
    return { ok: false, message: 'SQLite sigue ejecutando o esperando operaciones. No se interrumpirán guardados de resultado incierto.' };
  }
  if (backups.activeBackupOperations !== 0 || backups.queuedBackupOperations !== 0 ||
      backups.pendingBackupRevisions !== 0) {
    return { ok: false, message: 'Hay copias SQLite en curso, pendientes o sin completar. Se conserva la sesión para proteger el respaldo.' };
  }
  if (unresolvedWrites !== 0) {
    return { ok: false, message: 'Hay operaciones de escritura sin resultado reconciliado. El reinicio automático no es seguro.' };
  }
  return { ok: true, message: 'Sin operaciones SQLite, copias ni escrituras inciertas pendientes.' };
}

export function isAutomaticRestartDue(sinceAt: string | null, now: number): boolean {
  if (!sinceAt) return false;
  const started = Date.parse(sinceAt);
  return Number.isFinite(started) && now >= started &&
    now - started >= AUTOMATIC_RESTART_AFTER_MS;
}

export function isAutomaticRestartCooldownOver(previousAt: number | null, now: number): boolean {
  if (previousAt === null) return true;
  return Number.isFinite(previousAt) && Number.isFinite(now) &&
    now >= previousAt && now - previousAt >= AUTOMATIC_RESTART_COOLDOWN_MS;
}
