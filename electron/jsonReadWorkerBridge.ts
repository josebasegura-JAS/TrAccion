/** PR9D-4C: puente Electron para lecturas de módulos JSON readonly. */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { IsolatedJsonTable } from './persistence/isolatedJsonTables.js';
import type { SqliteJsonRecord } from './persistence/jsonRecordRepository.js';
import { runJsonReadWorker } from './jsonReadWorkerRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readJsonModuleInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  table: IsolatedJsonTable,
): Promise<SqliteJsonRecord[]> {
  return runJsonReadWorker({
    databasePath, expected, table,
    createChild: () => {
      const child = utilityProcess.fork(path.join(__dirname, 'jsonReadWorker.js'), [], {
        serviceName: 'TrAcción JSON modules readonly',
      });
      return {
        postMessage: message => child.postMessage(message),
        kill: () => { child.kill(); },
        onMessage: handler => { child.on('message', event => handler(event.data)); },
        onExit: handler => { child.on('exit', handler); },
      };
    },
  });
}
