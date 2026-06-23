import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatLockAge } from './databaseLockView';

describe('formatLockAge', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra segundos cuando la antigüedad es menor a un minuto', () => {
    expect(formatLockAge('2026-06-23T11:59:45.000Z')).toBe('hace 15 s');
  });

  it('muestra minutos cuando la antigüedad es de varios minutos', () => {
    expect(formatLockAge('2026-06-23T11:45:00.000Z')).toBe('hace 15 min');
  });

  it('muestra horas cuando la antigüedad supera la hora', () => {
    expect(formatLockAge('2026-06-23T09:00:00.000Z')).toBe('hace 3 h');
  });

  it('devuelve un mensaje legible cuando la fecha no es válida', () => {
    expect(formatLockAge('no-es-una-fecha')).toBe('antigüedad desconocida');
  });

  it('no devuelve un valor negativo si el reloj del otro equipo está ligeramente adelantado', () => {
    expect(formatLockAge('2026-06-23T12:00:05.000Z')).toBe('hace 0 s');
  });
});
