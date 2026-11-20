import { describe, expect, it } from 'vitest';
import { AUTOMATIC_RESTART_AFTER_MS, RESTART_SUGGESTION_AFTER_MS, isAutomaticRestartDue, shouldSuggestSupervisedRestart } from './safeRestartPolicy';

describe('reinicio supervisado de SQLite · calendario de avisos', () => {
  const t = Date.parse('2026-11-20T09:00:00.000Z');
  const since = new Date(t).toISOString();

  it('avisa desde los dos minutos sin reiniciar todavía', () => {
    expect(shouldSuggestSupervisedRestart(since, t + RESTART_SUGGESTION_AFTER_MS - 1)).toBe(false);
    expect(shouldSuggestSupervisedRestart(since, t + RESTART_SUGGESTION_AFTER_MS)).toBe(true);
    expect(isAutomaticRestartDue(since, t + RESTART_SUGGESTION_AFTER_MS)).toBe(false);
  });

  it('autoriza solicitar un reinicio automático a los cinco minutos', () => {
    expect(isAutomaticRestartDue(since, t + AUTOMATIC_RESTART_AFTER_MS - 1)).toBe(false);
    expect(isAutomaticRestartDue(since, t + AUTOMATIC_RESTART_AFTER_MS)).toBe(true);
    expect(isAutomaticRestartDue(null, t + AUTOMATIC_RESTART_AFTER_MS)).toBe(false);
    expect(isAutomaticRestartDue('invalida', t)).toBe(false);
    expect(isAutomaticRestartDue(since, t - 1)).toBe(false);
  });
});
