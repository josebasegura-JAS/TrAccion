export type RecoveryStepStatus = 'done' | 'active' | 'pending';
const STEPS = [
  'Detectar interrupción de conexión',
  'Comprobar acceso a SQLite compartida',
  'Actualizar datos del módulo activo',
  'Reanudar la aplicación',
] as const;

export function getRecoveryStepStatuses(phase: 'reconnecting' | 'syncing' | 'recovered'): RecoveryStepStatus[] {
  if (phase === 'reconnecting') return ['done', 'active', 'pending', 'pending'];
  if (phase === 'syncing') return ['done', 'done', 'active', 'pending'];
  return ['done', 'done', 'done', 'done'];
}

