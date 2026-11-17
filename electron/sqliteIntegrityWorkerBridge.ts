/**
 * PR9D · Adaptador Electron del preflight. Se usa SOLO ante posible corrupción,
 * después de cerrar el handle principal y dentro de la cola SQLite existente.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import { runSqliteIntegrityWorker } from './sqliteIntegrityWorkerRunner.js';
import { runIsolatedSqliteReadUnderHandoffBarrier } from './isolatedSqliteReadAdmission.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function verifySqliteIntegrityInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): Promise<void> {
  return runSqliteReadonlyWorker(databasePath, expected, 'integrity');
}

/** PR9D-2: health-check en proceso aislado, sin quick_check ni escrituras. */
export function verifySqliteHealthInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
): Promise<void> {
  // Health is normal main-owned work: reserve BEFORE utilityProcess.fork,
  // and release only after the runner confirms child EXIT. Integrity recovery
  // below uses a DIFFERENT supervisor-owned recovery barrier in quarantine.
  return runIsolatedSqliteReadUnderHandoffBarrier('health', () =>
    runSqliteReadonlyWorker(databasePath, expected, 'health'));
}

function runSqliteReadonlyWorker(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  mode: 'integrity' | 'health',
): Promise<void> {
  return runSqliteIntegrityWorker({
    databasePath,
    expected,
    mode,
    createChild: () => {
      const child = utilityProcess.fork(path.join(__dirname, 'sqliteIntegrityWorker.js'), [], {
        serviceName: mode === 'health'
          ? 'TrAcción SQLite readonly health-check'
          : 'TrAcción SQLite readonly integrity verification',
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
