import { describe, expect, it } from 'vitest';
import {
  assessSafeRestart,
  AUTOMATIC_RESTART_COOLDOWN_MS,
  AUTOMATIC_RESTART_AFTER_MS,
  isAutomaticRestartCooldownOver,
  isAutomaticRestartDue,
} from './safeRestartPolicy.js';

const queue = { queuedOperations: 0, runningOperation: null, timedOut: false };
const backups = { activeBackupOperations: 0, queuedBackupOperations: 0, pendingBackupRevisions: 0 };
describe('reinicio SQLite supervisado · condiciones de seguridad', () => {
  it('permite el reinicio únicamente cuando todos los observadores están inactivos', () => {
    expect(assessSafeRestart(queue, backups, 0).ok).toBe(true);
  });
  it.each([
    [{ ...queue, runningOperation: 'tasks:save-record' }, backups, 0],
    [{ ...queue, queuedOperations: 1 }, backups, 0],
    [{ ...queue, timedOut: true }, backups, 0],
    [queue, { ...backups, activeBackupOperations: 1 }, 0],
    [queue, { ...backups, queuedBackupOperations: 1 }, 0],
    [queue, { ...backups, pendingBackupRevisions: 1 }, 0],
    [queue, backups, 1],
  ])('rechaza un reinicio con trabajo o resultados inciertos', (q, b, unresolved) => {
    expect(assessSafeRestart(q, b, unresolved).ok).toBe(false);
  });
  it('solo ofrece reinicio automático tras cinco minutos continuados de incidencia', () => {
    const t = Date.parse('2026-11-20T09:00:00Z');
    const start = new Date(t).toISOString();
    expect(isAutomaticRestartDue(start, t + AUTOMATIC_RESTART_AFTER_MS - 1)).toBe(false);
    expect(isAutomaticRestartDue(start, t + AUTOMATIC_RESTART_AFTER_MS)).toBe(true);
    expect(isAutomaticRestartDue(null, t + AUTOMATIC_RESTART_AFTER_MS)).toBe(false);
    expect(isAutomaticRestartDue(start, t - 1)).toBe(false);
    expect(isAutomaticRestartDue('fecha-incorrecta', t)).toBe(false);
  });
  it('impide un bucle automático durante treinta minutos, incluidos relojes atrasados', () => {
    const t = Date.parse('2026-11-20T09:00:00Z');
    expect(isAutomaticRestartCooldownOver(null, t)).toBe(true);
    expect(isAutomaticRestartCooldownOver(t, t + AUTOMATIC_RESTART_COOLDOWN_MS - 1)).toBe(false);
    expect(isAutomaticRestartCooldownOver(t, t + AUTOMATIC_RESTART_COOLDOWN_MS)).toBe(true);
    expect(isAutomaticRestartCooldownOver(t, t - 1)).toBe(false);
  });
});
