import { describe, expect, it } from 'vitest';
import { hasSyncTokenChanged } from './externalDataSync';

describe('hasSyncTokenChanged', () => {
  it('detecta el primer token disponible tras arrancar sin baseline', () => {
    expect(hasSyncTokenChanged(null, '2026-10-04T18:00:00.000Z')).toBe(true);
  });

  it('no recarga cuando el token no cambia', () => {
    expect(
      hasSyncTokenChanged('2026-10-04T18:00:00.000Z', '2026-10-04T18:00:00.000Z'),
    ).toBe(false);
  });

  it('detecta cambios posteriores y transición a tabla vacía', () => {
    expect(
      hasSyncTokenChanged('2026-10-04T18:00:00.000Z', '2026-10-04T18:01:00.000Z'),
    ).toBe(true);
    expect(hasSyncTokenChanged('2026-10-04T18:00:00.000Z', null)).toBe(true);
  });

  it('considera equivalentes null y undefined', () => {
    expect(hasSyncTokenChanged(null, undefined)).toBe(false);
  });
});
