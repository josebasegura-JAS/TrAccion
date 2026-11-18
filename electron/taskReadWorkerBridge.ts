/**
 * PR9D-4A · Adaptador local de Electron al lector readonly de Tareas.
 * Ninguna ruta ni información de trabajadores se escribe en logs.
 */
import { utilityProcess } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExpectedSqliteIdentity } from './persistence/sqliteIntegrityVerification.js';
import type { SqliteTaskRecord, SqliteTaskRecordsFilter } from './persistence/taskRepository.js';
import { runTaskReadWorker } from './taskReadWorkerRunner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function readTasksInUtilityProcess(
  databasePath: string,
  expected: ExpectedSqliteIdentity,
  filter: SqliteTaskRecordsFilter,
): Promise<SqliteTaskRecord[]> {
  return runTaskReadWorker({
    databasePath, expected, filter,
    createChild: () => {
      const child = utilityProcess.fork(path.join(__dirname, 'taskReadWorker.js'), [], {
        serviceName: 'TrAcción tasks read-only',
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
