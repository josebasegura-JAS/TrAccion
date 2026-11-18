/** PR9D-4B · Adaptador Electron al lector readonly de sesiones. */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteComiteSessionRecord } from './persistence/sesionesRepository.js';
import type { SessionReadKind } from './sessionReadWorkerProtocol.js';
import { runSessionReadWorker } from './sessionReadWorkerRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readSessionsInUtilityProcess(
 databasePath: string, expected: ExpectedSqliteIdentity,
 module: SessionReadKind, id?: string,
): Promise<SqliteComiteSessionRecord[]> {
 return runSessionReadWorker({
   databasePath, expected, module,
   ...(id === undefined ? {} : { id }),
   createChild: () => {
     const child = utilityProcess.fork(path.join(__dirname, 'sessionReadWorker.js'), [], {
       serviceName: 'TrAcción Comité/Paritaria readonly',
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
