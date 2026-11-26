import { utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { createEngineClient } from './sqliteEngineTransport.js';
import type { DatabaseStatus, DatabaseConnectivityIssuePayload } from './sqlitePersistence.js';
import type * as Persistence from './sqlitePersistence.js';
import type { SqliteEngineOperationName } from './sqliteEngineOperations.js';

export function startIsolatedTestEngine(userData: string, onStatus?: (status: DatabaseStatus) => void, onConnectivity?: (payload: DatabaseConnectivityIssuePayload) => void) {
  const child = utilityProcess.fork(fileURLToPath(new URL('./sqliteEngineWorker.js', import.meta.url)), [
    '--traccion-env=test', '--sqlite-user-data=' + userData,
  ], { serviceName: 'TrAcción SQLite test engine' });
  let exitConfirmed = false;
  let exitWasIdle = false;
  const exited = new Promise<number>((resolve) => child.once('exit', (code) => {
    exitWasIdle = client.getState() === 'idle';
    exitConfirmed = true;
    resolve(code);
  }));
  const client = createEngineClient({
    postMessage: (message) => child.postMessage(message),
    onMessage: (listener) => { child.on('message', listener); },
    onExit: (listener) => { child.on('exit', listener); },
  });
  child.on('message', (message: unknown) => {
    if (!message || typeof message !== 'object' || !('kind' in message)) return;
    if (message.kind === 'engine:status' && 'status' in message) onStatus?.(message.status as DatabaseStatus);
    if (message.kind === 'engine:connectivity' && 'payload' in message) onConnectivity?.(message.payload as DatabaseConnectivityIssuePayload);
  });
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El motor no confirmó su arranque.')), 15_000);
    child.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'kind' in message && message.kind === 'engine:ready') {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once('exit', () => {
      clearTimeout(timer);
      reject(new Error('El motor salió antes de confirmar su arranque.'));
    });
  });
  // Sin recreación automática: el llamante debe conservar esta instancia
  // incluso cuando una petición expira.
  let closing = false;
  async function call<K extends SqliteEngineOperationName>(
    name: K, ...args: Parameters<(typeof Persistence)[K]>
  ): Promise<Awaited<ReturnType<(typeof Persistence)[K]>>> {
    if (closing) throw new Error('Motor en cierre.');
    await ready;
    if (closing) throw new Error('Motor en cierre.');
    return await client.call(name, args, 120_000) as Awaited<ReturnType<(typeof Persistence)[K]>>;
  }
  return {
    ready, call, exited,
    hasExited: () => exitConfirmed,
    exitedWhileIdle: () => exitConfirmed && exitWasIdle,
    async callExtra(name: string, args: unknown[]) {
      if (closing) throw new Error('Motor en cierre.');
      await ready;
      if (closing) throw new Error('Motor en cierre.');
      return client.call(name, args, 120_000);
    },
    getState: client.getState,
    async close() {
      if (closing) throw new Error('Cierre ya solicitado.');
      if (client.getState() !== 'idle') throw new Error('Motor ocupado o con resultado incierto.');
      closing = true;
      await ready;
      const metrics = await client.call('closeSqlitePersistence', [], 120_000) as Persistence.ShutdownPerformanceMetrics;
      child.postMessage('engine:shutdown');
      const code = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('El motor no confirmó su salida tras el cierre.')), 15_000);
        void exited.then((value) => { clearTimeout(timer); resolve(value); });
      });
      if (code !== 0) throw new Error('Salida SQLite no limpia: ' + code);
      return metrics;
    },
  };
}
