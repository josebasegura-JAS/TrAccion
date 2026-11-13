/** Puente de ejecución del primer escritor real en utilityProcess.
 * NO se importa desde main ni desde los handlers IPC de producción.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DetachedWriterRequest } from './detachedCriteriaWriterProtocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DetachedCriteriaWriterChild {
  postMessage(message: DetachedWriterRequest): void;
  onMessage(handler: (data: unknown) => void): void;
  onExit(handler: (code: number) => void): void;
  kill(): void;
}

export function forkDetachedCriteriaWriter(): DetachedCriteriaWriterChild {
  const child = utilityProcess.fork(path.join(__dirname, 'detachedCriteriaWriterWorker.js'), [], {
    serviceName: 'TrAcción · escritor SQLite aislado (ensayo)',
  });
  return {
    postMessage: message => child.postMessage(message),
    onMessage: handler => { child.on('message', event => handler(event.data)); },
    onExit: handler => { child.on('exit', handler); },
    kill: () => { child.kill(); },
  };
}
