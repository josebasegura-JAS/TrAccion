/**
 * PR9D · Adaptador Electron del preflight. Se usa SOLO ante posible corrupción,
 * después de cerrar el handle principal y dentro de la cola SQLite existente.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import { runSqliteIntegrityWorker } from './sqliteIntegrityWorkerRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function verifySqliteIntegrityInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): Promise<void> {
  return runSqliteIntegrityWorker({
    databasePath,
    expected,
    createChild: () => {
      const child = utilityProcess.fork(path.join(__dirname, 'sqliteIntegrityWorker.js'), [], {
        serviceName: 'TrAcción SQLite readonly integrity verification',
      });
      return {
        postMessage: (message) => child.postMessage(message),
        kill: () => { child.kill(); },
        onMessage: (handler) => { child.on('message', (event) => handler(event.data)); },
        onExit: (handler) => { child.on('exit', handler); },
      };
    },
  });
}
