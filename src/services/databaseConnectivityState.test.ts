import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getDatabaseConnectivityState,
  publishDatabaseConnectivityState,
  subscribeDatabaseConnectivityState,
} from './databaseConnectivityState';

afterEach(() => {
  publishDatabaseConnectivityState('connected', 'Conexión con la base compartida verificada.');
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('databaseConnectivityState', () => {
  it('pasa a reconectando con al menos un intento y conserva el mensaje recibido', () => {
    publishDatabaseConnectivityState('reconnecting', 'Reconectando…', 0);

    expect(getDatabaseConnectivityState()).toMatchObject({
      phase: 'reconnecting',
      message: 'Reconectando…',
      attempt: 0,
    });

    publishDatabaseConnectivityState('reconnecting', 'Segundo intento', 2);
    expect(getDatabaseConnectivityState()).toMatchObject({
      phase: 'reconnecting',
      message: 'Segundo intento',
      attempt: 2,
    });
  });

  it('notifica a los suscriptores solo cuando cambia realmente el estado visible', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeDatabaseConnectivityState(listener);

    publishDatabaseConnectivityState('syncing', 'Actualizando datos compartidos…');
    publishDatabaseConnectivityState('syncing', 'Actualizando datos compartidos…');
    publishDatabaseConnectivityState('recovered', 'Conexión restablecida.');

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();

    publishDatabaseConnectivityState('connected');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('mantiene bloqueada la secuencia reconectando → sincronizando → recuperado', () => {
    publishDatabaseConnectivityState('reconnecting', 'Sin red', 3);
    expect(getDatabaseConnectivityState().phase).toBe('reconnecting');

    publishDatabaseConnectivityState('syncing', 'Recargando datos');
    expect(getDatabaseConnectivityState()).toMatchObject({ phase: 'syncing', attempt: 0 });

    publishDatabaseConnectivityState('recovered', 'Datos actualizados');
    expect(getDatabaseConnectivityState()).toMatchObject({
      phase: 'recovered',
      message: 'Datos actualizados',
      attempt: 0,
    });
  });

  it('tras mostrar recuperado vuelve automáticamente a conectado a los 3 segundos', () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    });

    publishDatabaseConnectivityState('recovered', 'Conexión restablecida.');
    expect(getDatabaseConnectivityState().phase).toBe('recovered');

    vi.advanceTimersByTime(2_999);
    expect(getDatabaseConnectivityState().phase).toBe('recovered');

    vi.advanceTimersByTime(1);
    expect(getDatabaseConnectivityState()).toMatchObject({
      phase: 'connected',
      message: 'Conexión con la base compartida verificada.',
      attempt: 0,
    });
  });
});
