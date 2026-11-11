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


describe('aviso conservador de desfase horario en bloqueos', () => {
  const now = Date.parse('2026-11-11T12:00:00.000Z');

  it('avisa cuando la fecha de otro equipo supera el margen de 5 segundos', async () => {
    const { getLockClockWarning } = await import('./databaseLockView');
    expect(getLockClockWarning('2026-11-11T12:00:06.000Z', now)).toContain('desfase horario');
  });

  it('no avisa ante diferencias pequeñas; no las presenta como sincronización certificada', async () => {
    const { getLockClockWarning } = await import('./databaseLockView');
    expect(getLockClockWarning('2026-11-11T12:00:05.000Z', now)).toBeNull();
    expect(getLockClockWarning('2026-11-11T11:59:00.000Z', now)).toBeNull();
  });

  it('avisa de una fecha ilegible y evita una liberación basada en datos inválidos', async () => {
    const { getLockClockWarning } = await import('./databaseLockView');
    expect(getLockClockWarning('fecha rota', now)).toContain('inválida');
  });
});
