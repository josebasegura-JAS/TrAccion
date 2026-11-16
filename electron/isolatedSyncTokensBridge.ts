import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { IsolatedSyncTokens } from './isolatedSyncTokensCore.js';
import { runIsolatedSyncTokens } from './isolatedSyncTokensRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readSyncTokensInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): Promise<IsolatedSyncTokens> {
  return runIsolatedSyncTokens({
    databasePath,
    expected,
    createChild: () => {
      const child = utilityProcess.fork(path.join(__dirname, 'isolatedSyncTokensWorker.js'), [], {
        serviceName: 'TrAcción SQLite readonly sync tokens',
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
