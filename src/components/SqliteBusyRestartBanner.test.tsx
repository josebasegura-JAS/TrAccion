import { describe, expect, it } from 'vitest';
import { shouldSuggestSqliteBusyRestart } from './sqliteBusyRestartPolicy';

describe('SqliteBusyRestartBanner', () => {
  const started = '2026-11-18T12:00:00.000Z';
  const time = Date.parse(started);

  it('no ofrece reiniciar antes de 2 minutos o sin 3 BUSY consecutivos', () => {
    expect(shouldSuggestSqliteBusyRestart(null, 8, time + 150_000)).toBe(false);
    expect(shouldSuggestSqliteBusyRestart(started, 2, time + 150_000)).toBe(false);
    expect(shouldSuggestSqliteBusyRestart(started, 3, time + 119_999)).toBe(false);
  });

  it('ofrece reinicio voluntario tras dos minutos de contención mantenida', () => {
    expect(shouldSuggestSqliteBusyRestart(started, 3, time + 120_000)).toBe(true);
  });

  it('ignora fechas de diagnóstico inválidas o futuras', () => {
    expect(shouldSuggestSqliteBusyRestart('invalida', 10, time + 120_000)).toBe(false);
    expect(shouldSuggestSqliteBusyRestart(started, 3, time - 60_000)).toBe(false);
  });
});
