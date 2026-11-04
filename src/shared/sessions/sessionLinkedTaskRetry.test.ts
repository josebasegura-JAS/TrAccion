import { describe, expect, it } from 'vitest';
import { dueLinkedTaskIds, nextLinkedTaskRetry, nextLinkedTaskRetryAt } from './sessionLinkedTaskRetry';

describe('reintentos de puntos históricos ausentes', () => {
  it('reintenta inicialmente tras 30 segundos y aumenta la espera con límite', () => {
    const first = nextLinkedTaskRetry(undefined, 1_000);
    expect(first).toEqual({ attempts: 1, nextAt: 31_000 });
    const second = nextLinkedTaskRetry(first, 31_000);
    expect(second).toEqual({ attempts: 2, nextAt: 91_000 });
    let current = second;
    for (let index = 0; index < 8; index += 1) {
      current = nextLinkedTaskRetry(current, current.nextAt);
    }
    expect(current.nextAt - second.nextAt).toBeGreaterThan(0);
    const last = nextLinkedTaskRetry(current, current.nextAt);
    expect(last.nextAt - current.nextAt).toBe(300_000);
  });

  it('no vuelve a consultar en cada render si el punto está en espera', () => {
    const retries = new Map([['ausente', { attempts: 1, nextAt: 35_000 }]]);
    expect(dueLinkedTaskIds(['ausente'], new Set(), retries, 2_000)).toEqual([]);
    expect(nextLinkedTaskRetryAt(['ausente'], new Set(), retries, 2_000)).toBe(35_000);
    expect(dueLinkedTaskIds(['ausente'], new Set(), retries, 35_000)).toEqual(['ausente']);
  });

  it('nunca duplica solicitudes simultáneas para el mismo punto', () => {
    const retries = new Map<string, { attempts: number; nextAt: number }>();
    expect(dueLinkedTaskIds(['uno', 'dos'], new Set(['uno']), retries, 0)).toEqual(['dos']);
    expect(nextLinkedTaskRetryAt(['uno', 'dos'], new Set(['uno']), retries, 0)).toBeNull();
  });

  it('permite consultar de nuevo al vencer el periodo de espera', () => {
    const retries = new Map([['punto-no-disponible', nextLinkedTaskRetry(undefined, 5_000)]]);
    expect(dueLinkedTaskIds(['punto-no-disponible'], new Set(), retries, 34_999)).toEqual([]);
    expect(dueLinkedTaskIds(['punto-no-disponible'], new Set(), retries, 35_000)).toEqual(['punto-no-disponible']);
    retries.delete('punto-no-disponible');
    expect(nextLinkedTaskRetryAt(['punto-no-disponible'], new Set(), retries, 35_000)).toBeNull();
  });
});
