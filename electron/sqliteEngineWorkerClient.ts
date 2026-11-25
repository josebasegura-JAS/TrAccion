import { utilityProcess } from 'electron';
import { fileURLToPath } from 'node:url';
import { createEngineClient } from './sqliteEngineTransport.js';
import type * as Persistence from './sqlitePersistence.js';
import type { SqliteEngineOperationName } from './sqliteEngineOperations.js';

export function startIsolatedTestEngine(userData: string) {
  const child = utilityProcess.fork(fileURLToPath(new URL('./sqliteEngineWorker.js', import.meta.url)), [
    '--traccion-env=test', '--sqlite-user-data=' + userData,
  ], { serviceName: 'TrAcción SQLite test engine' });
  const exited = new Promise<number>((resolve) => child.once('exit', resolve));
  const client = createEngineClient({
    postMessage: (message) => child.postMessage(message),
    onMessage: (listener) => { child.on('message', listener); },
    onExit: (listener) => { child.on('exit', listener); },
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
    return await client.call(name, args) as Awaited<ReturnType<(typeof Persistence)[K]>>;
  }
  return {
    ready, call, exited,
    getState: client.getState,
    async close() {
      if (closing) throw new Error('Cierre ya solicitado.');
      if (client.getState() !== 'idle') throw new Error('Motor ocupado o con resultado incierto.');
      closing = true;
      await ready;
      await client.call('closeSqlitePersistence', [], 60_000);
      child.postMessage('engine:shutdown');
      const code = await exited;
      if (code !== 0) throw new Error('Salida SQLite no limpia: ' + code);
    },
  };
}
