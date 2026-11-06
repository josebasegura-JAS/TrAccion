import { afterEach, describe, expect, it, vi } from 'vitest';
import { notifyMainWatchdogOperation, registerMainWatchdogOperationSender } from './mainWatchdogBridge';

afterEach(() => registerMainWatchdogOperationSender(null));

describe('instrumentación del watchdog externo', () => {
  it('notifica el inicio y el fin sin identificadores de registros', () => {
    const listener = vi.fn();
    registerMainWatchdogOperationSender(listener);
    notifyMainWatchdogOperation('start', 'database:health-check');
    notifyMainWatchdogOperation('finish', 'database:health-check');
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0][0]).toMatchObject({ kind: 'operation', phase: 'start', name: 'database:health-check' });
    expect(listener.mock.calls[1][0]).toMatchObject({ kind: 'operation', phase: 'finish', name: 'database:health-check' });
  });

  it('descarta nombres dinámicos para evitar que entren datos sensibles', () => {
    const listener = vi.fn();
    registerMainWatchdogOperationSender(listener);
    notifyMainWatchdogOperation('start', 'task:John Smith');
    notifyMainWatchdogOperation('start', 'path:C:\\Company\\private.sqlite');
    notifyMainWatchdogOperation('start', 'database:health-check');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('la ausencia o caída del watchdog no afecta a SQLite', () => {
    registerMainWatchdogOperationSender(() => { throw new Error('watchdog offline'); });
    expect(() => notifyMainWatchdogOperation('start', 'database:health-check')).not.toThrow();
    registerMainWatchdogOperationSender(null);
    expect(() => notifyMainWatchdogOperation('finish', 'database:health-check')).not.toThrow();
  });
});
